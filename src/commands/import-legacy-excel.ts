import ExcelJS from 'exceljs';
import { eq, inArray, sql } from 'drizzle-orm';
import { closeDatabase, database } from '../database';
import { clients, projects, users, workEntries } from '../db/schema';

const REQUIRED_HEADERS = [
  'Client',
  'Project',
  'Day',
  'Date',
  'Rate',
  'Value',
  'Description',
  'Hours',
  'Billed',
] as const;

type LegacyEntry = {
  sourceRow: number;
  clientName: string;
  projectName: string;
  workDate: string;
  durationMinutes: number;
  description: string;
  hourlyRate: string;
  amount: string;
  isBilled: boolean;
};

type ImportOptions = {
  file: string;
  email: string;
  dryRun: boolean;
  replaceUserData: boolean;
};

const usage = () => {
  console.log(
    'Usage: bun run data:import-legacy -- --file <export.xlsx> --email <user@email> [--dry-run] [--replace-user-data]',
  );
};

const optionsFrom = (args: string[]): ImportOptions => {
  const valueFor = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const file = valueFor('--file');
  const email = valueFor('--email');
  if (!file || !email) {
    usage();
    throw new Error('Both --file and --email are required');
  }
  return {
    file,
    email: email.trim().toLowerCase(),
    dryRun: args.includes('--dry-run'),
    replaceUserData: args.includes('--replace-user-data'),
  };
};

const textValue = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return String(value.result ?? '');
  }
  return String(value);
};

const numberValue = (value: ExcelJS.CellValue, label: string, row: number): number => {
  const normalized = typeof value === 'number' ? value : Number(textValue(value));
  if (!Number.isFinite(normalized)) throw new Error(`Invalid ${label} on Excel row ${row}`);
  return normalized;
};

const durationMinutesValue = (value: ExcelJS.CellValue, row: number): number => {
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes() + Math.round(value.getUTCSeconds() / 60);
  }
  return Math.round(numberValue(value, 'duration', row) * 24 * 60);
};

const excelDate = (value: ExcelJS.CellValue, row: number): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const raw = textValue(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      ? raw.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, '$3-$2-$1')
      : '';
  if (!iso || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
    throw new Error(`Invalid date on Excel row ${row}`);
  }
  return iso;
};

const headerMap = (worksheet: ExcelJS.Worksheet): Map<string, number> => {
  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell((cell, column) => headers.set(textValue(cell.value).trim(), column));
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length) throw new Error(`Missing Excel columns: ${missing.join(', ')}`);
  return headers;
};

const duplicateSignature = (entry: LegacyEntry) =>
  [
    entry.clientName,
    entry.projectName,
    entry.workDate,
    entry.durationMinutes,
    entry.description,
    entry.hourlyRate,
    entry.amount,
    entry.isBilled,
  ].join('\u001f');

export const readLegacyWorkbook = async (file: string): Promise<LegacyEntry[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('The workbook does not contain a worksheet');
  const headers = headerMap(worksheet);
  const entries: LegacyEntry[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const get = (header: (typeof REQUIRED_HEADERS)[number]) => row.getCell(headers.get(header)!).value;
    const clientName = textValue(get('Client')).trim();
    const projectName = textValue(get('Project')).trim();
    const description = textValue(get('Description')).trim();
    if (!clientName && !projectName && !description) continue;
    if (!clientName || !projectName || !description) {
      throw new Error(`Client, project and description are required on Excel row ${rowNumber}`);
    }
    const durationMinutes = durationMinutesValue(get('Hours'), rowNumber);
    if (durationMinutes < 0) throw new Error(`Negative duration on Excel row ${rowNumber}`);
    const hourlyRate = numberValue(get('Rate'), 'rate', rowNumber);
    const amount = numberValue(get('Value'), 'value', rowNumber);
    const expectedAmount = Math.round((durationMinutes / 60) * hourlyRate * 100) / 100;
    if (Math.abs(expectedAmount - amount) > 0.001) {
      throw new Error(`Value does not match duration and rate on Excel row ${rowNumber}`);
    }
    entries.push({
      sourceRow: rowNumber,
      clientName,
      projectName,
      workDate: excelDate(get('Date'), rowNumber),
      durationMinutes,
      description,
      hourlyRate: hourlyRate.toFixed(2),
      amount: amount.toFixed(2),
      isBilled: numberValue(get('Billed'), 'billed status', rowNumber) !== 0,
    });
  }

  const duplicateGroups = new Map<string, LegacyEntry[]>();
  for (const entry of entries) {
    const signature = duplicateSignature(entry);
    duplicateGroups.set(signature, [...(duplicateGroups.get(signature) ?? []), entry]);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    group.forEach((entry, index) => {
      entry.description = `${entry.description}-${index + 1}`;
    });
  }
  return entries;
};

const projectKey = (clientName: string, projectName: string) =>
  `${clientName.trim().toLocaleLowerCase('fr-CA')}\u001f${projectName.trim().toLocaleLowerCase('fr-CA')}`;

const summarize = (entries: LegacyEntry[]) => {
  const clientNames = new Set(entries.map((entry) => entry.clientName.toLocaleLowerCase('fr-CA')));
  const projectNames = new Set(entries.map((entry) => projectKey(entry.clientName, entry.projectName)));
  return {
    clients: clientNames.size,
    projects: projectNames.size,
    entries: entries.length,
    billed: entries.filter((entry) => entry.isBilled).length,
    deleted: 0,
    totalMinutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    totalAmount: entries.reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2),
    firstDate: entries.map((entry) => entry.workDate).sort()[0],
    lastDate: entries.map((entry) => entry.workDate).sort().at(-1),
  };
};

const run = async () => {
  const options = optionsFrom(process.argv.slice(2));
  const entries = await readLegacyWorkbook(options.file);
  const summary = summarize(entries);
  const matchingUsers = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${options.email}`);
  if (matchingUsers.length !== 1) throw new Error(`Expected exactly one user for ${options.email}`);
  const user = matchingUsers[0]!;

  console.log(JSON.stringify({ mode: options.dryRun ? 'dry-run' : 'import', user, summary }, null, 2));
  if (options.dryRun) return;
  if (!options.replaceUserData) {
    throw new Error('Import requires --replace-user-data to avoid mixing legacy and existing data');
  }

  await database.transaction(async (transaction) => {
    const existingClients = await transaction
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.userId, user.id));
    const clientIds = existingClients.map((client) => client.id);
    if (clientIds.length) {
      const existingProjects = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.clientId, clientIds));
      await transaction.delete(workEntries).where(eq(workEntries.userId, user.id));
      if (existingProjects.length) {
        await transaction.delete(projects).where(inArray(projects.id, existingProjects.map((p) => p.id)));
      }
      await transaction.delete(clients).where(inArray(clients.id, clientIds));
    }

    const canonicalClients = new Map<string, string>();
    for (const entry of entries) {
      const key = entry.clientName.toLocaleLowerCase('fr-CA');
      if (!canonicalClients.has(key)) canonicalClients.set(key, entry.clientName);
    }
    const insertedClients = await transaction
      .insert(clients)
      .values([...canonicalClients.values()].map((name) => ({ userId: user.id, name, isActive: true })))
      .returning({ id: clients.id, name: clients.name });
    const clientIdsByName = new Map(
      insertedClients.map((client) => [client.name.toLocaleLowerCase('fr-CA'), client.id]),
    );

    const latestEntryByProject = new Map<string, LegacyEntry>();
    for (const entry of entries) {
      const key = projectKey(entry.clientName, entry.projectName);
      const current = latestEntryByProject.get(key);
      if (!current || entry.workDate > current.workDate) latestEntryByProject.set(key, entry);
    }
    const insertedProjects = await transaction
      .insert(projects)
      .values(
        [...latestEntryByProject.values()].map((entry) => ({
          clientId: clientIdsByName.get(entry.clientName.toLocaleLowerCase('fr-CA'))!,
          name: entry.projectName,
          hourlyRate: Number(entry.hourlyRate) < 0 ? '0.00' : entry.hourlyRate,
          isActive: true,
        })),
      )
      .returning({ id: projects.id, clientId: projects.clientId, name: projects.name });
    const clientNamesById = new Map(insertedClients.map((client) => [client.id, client.name]));
    const projectIdsByName = new Map(
      insertedProjects.map((project) => [projectKey(clientNamesById.get(project.clientId)!, project.name), project.id]),
    );

    await transaction.insert(workEntries).values(
      entries.map((entry) => ({
        userId: user.id,
        projectId: projectIdsByName.get(projectKey(entry.clientName, entry.projectName))!,
        workDate: entry.workDate,
        durationMinutes: entry.durationMinutes,
        description: entry.description,
        hourlyRate: entry.hourlyRate,
        amount: entry.amount,
        isBilled: entry.isBilled,
        isDeleted: false,
      })),
    );
  });

  const [actual] = await database
    .select({
      entries: sql<number>`count(*)::int`,
      billed: sql<number>`count(*) filter (where ${workEntries.isBilled})::int`,
      deleted: sql<number>`count(*) filter (where ${workEntries.isDeleted})::int`,
      totalMinutes: sql<number>`coalesce(sum(${workEntries.durationMinutes}), 0)::int`,
      totalAmount: sql<string>`coalesce(sum(${workEntries.amount}), 0)::numeric(14,2)`,
    })
    .from(workEntries)
    .where(eq(workEntries.userId, user.id));
  const [entityCounts] = await database
    .select({
      clients: sql<number>`count(distinct ${clients.id})::int`,
      projects: sql<number>`count(distinct ${projects.id})::int`,
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .where(eq(clients.userId, user.id));
  const reconciliation = { ...entityCounts, ...actual };
  const expected = {
    clients: summary.clients,
    projects: summary.projects,
    entries: summary.entries,
    billed: summary.billed,
    deleted: summary.deleted,
    totalMinutes: summary.totalMinutes,
    totalAmount: summary.totalAmount,
  };
  if (JSON.stringify(reconciliation) !== JSON.stringify(expected)) {
    throw new Error(`Post-import reconciliation failed: ${JSON.stringify({ expected, reconciliation })}`);
  }
  console.log(JSON.stringify({ status: 'complete', reconciliation }, null, 2));
};

await run().finally(closeDatabase);
