import ExcelJS from 'exceljs';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { database } from '../../database';
import { clients, hourBankClosures, hourBankDays, projects, workEntries } from '../../db/schema';
import {
  descriptionDocumentExportText,
  parseLegacyDescription,
  type DescriptionLine,
} from './description-document';

type ExportOptions = { from: string; to: string; clientId?: string; projectId?: string; includeDeleted: boolean; confidential: boolean; language: 'fr' | 'en' };
type ExportUser = { id: string; firstName: string; lastName: string };

const labels = {
  client: 'Client',
  project: 'Project',
  day: 'Day',
  date: 'Date',
  description: 'Description',
  hours: 'Hours',
  rate: 'Rate',
  value: 'Value',
  total: 'Total',
  allClients: 'AllClient',
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
} as const;

export const confidentialExportNotice = {
  fr: [
    'Certaines informations ont été volontairement masquées parce qu’elles sont identifiées comme internes.',
    'Lorsqu’elles sont pertinentes et communicables, elles peuvent être fournies sur demande par une personne responsable.',
    'Certaines notes peuvent toutefois être strictement internes et ne pas être destinées à être communiquées.',
  ],
  en: [
    'Some information has been intentionally hidden because it is marked as internal.',
    'When relevant and appropriate for disclosure, it may be provided upon request by an authorized representative.',
    'Some notes may, however, be strictly internal and not intended for disclosure.',
  ],
} as const;

// Ces transformations reproduisent le nom et les valeurs de date de l'ancien
// export Excel utilisé par les clients.
const excelDate = (value: string) => new Date(`${value}T00:00:00Z`);
const filenamePart = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/\s+/g, ' ')
  .trim();
const filenameDate = (value: string) => { const [year, month, day] = value.split('-'); return `${day}-${month}-${year}`; };
export const exportDescription = (description: string) => description
  // Les lignes préfixées par trois tirets sont des notes internes qui ne doivent
  // jamais apparaître dans un document remis au client.
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith('---'))
  .join('\n');

export const exportEntryDescription = (
  description: string,
  document: DescriptionLine[] | null,
) => descriptionDocumentExportText(document ?? parseLegacyDescription(description));

export const hasHiddenDescriptionLines = (
  description: string,
  document: DescriptionLine[] | null,
) => (document ?? parseLegacyDescription(description))
  .some((line) => !line.includedInExport);

export const internalEntryNotice = (language: 'fr' | 'en') => [
    '-------------',
    ...confidentialExportNotice[language],
  ].join('\n');

export const exportEntryDescriptionWithNotice = (
  description: string,
  document: DescriptionLine[] | null,
  language: 'fr' | 'en',
) => {
  const exported = exportEntryDescription(description, document);
  return hasHiddenDescriptionLines(description, document)
    ? [exported, internalEntryNotice(language)].filter(Boolean).join('\n')
    : exported;
};

const bankHours = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const descriptionWithBankCode = (
  description: string,
  openingMinutes: number,
  movementMinutes: number,
  closingMinutes: number,
) => {
  const lines = exportDescription(description)
    .split(/\r?\n/)
    .filter((line) => !/^\s*-\s*Code H\s*:/i.test(line));
  const operation = movementMinutes === 0
    ? ''
    : ` (${bankHours(openingMinutes)}${movementMinutes > 0 ? '+' : '-'}${bankHours(Math.abs(movementMinutes))})`;
  lines.splice(1, 0, `- Code H: ${bankHours(closingMinutes)}${operation}`);
  return lines.join('\n');
};

export const exportWorkEntries = async (user: ExportUser, options: ExportOptions) => {
  // Les clients et projets inactifs sont invisibles dans l'application et sont
  // donc également exclus de l'export.
  const conditions = [eq(workEntries.userId, user.id), eq(clients.userId, user.id), eq(clients.isActive, true), eq(projects.isActive, true), gte(workEntries.workDate, options.from), lte(workEntries.workDate, options.to)];
  if (options.clientId) conditions.push(eq(clients.id, options.clientId));
  if (options.projectId) conditions.push(eq(projects.id, options.projectId));
  if (!options.includeDeleted) conditions.push(eq(workEntries.isDeleted, false));
  const rows = await database.select({ id: workEntries.id, clientId: clients.id, projectId: projects.id, clientName: clients.name, projectName: projects.name, workDate: workEntries.workDate, durationMinutes: workEntries.durationMinutes, clientMinutes: workEntries.clientMinutes, description: workEntries.description, descriptionDocument: workEntries.descriptionDocument, hourlyRate: workEntries.hourlyRate, amount: workEntries.amount, createdAt: workEntries.createdAt })
    .from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id)).where(and(...conditions)).orderBy(desc(workEntries.workDate), desc(workEntries.createdAt));

  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  const bankConfigurations = projectIds.length
    ? await database
      .select({
        id: projects.id,
        startDate: projects.hourBankStartDate,
        initialMinutes: projects.hourBankInitialMinutes,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        inArray(projects.id, projectIds),
        eq(clients.userId, user.id),
        eq(projects.hourBankEnabled, true),
      ))
    : [];
  const bankDays = bankConfigurations.length
    ? await database
      .select({
        projectId: hourBankClosures.projectId,
        workDate: hourBankDays.workDate,
        billedMinutes: hourBankDays.billedMinutes,
        movementMinutes: hourBankDays.movementMinutes,
      })
      .from(hourBankDays)
      .innerJoin(hourBankClosures, eq(hourBankDays.closureId, hourBankClosures.id))
      .where(and(
        eq(hourBankClosures.userId, user.id),
        inArray(hourBankClosures.projectId, bankConfigurations.map((project) => project.id)),
        lte(hourBankDays.workDate, options.to),
      ))
      .orderBy(asc(hourBankDays.workDate))
    : [];
  const bankByDate = new Map<string, {
    openingMinutes: number;
    closingMinutes: number;
    movementMinutes: number;
    billedMinutes: number;
  }>();
  for (const project of bankConfigurations) {
    let balance = project.initialMinutes;
    for (const day of bankDays.filter((item) => item.projectId === project.id)) {
      const openingMinutes = balance;
      balance += day.movementMinutes;
      if (project.startDate && day.workDate >= project.startDate) {
        bankByDate.set(`${project.id}:${day.workDate}`, {
          openingMinutes,
          closingMinutes: balance,
          movementMinutes: day.movementMinutes,
          billedMinutes: day.billedMinutes,
        });
      }
    }
  }

  // Les colonnes d'identification deviennent inutiles lorsqu'un filtre désigne
  // déjà précisément le client ou le projet.
  const text = labels; const showClient = !options.clientId; const showProject = !options.projectId;
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'OnTime'; workbook.created = new Date();
  const sheet = workbook.addWorksheet('A');
  sheet.properties.defaultRowHeight = 15;
  const columns: Partial<ExcelJS.Column>[] = [];
  if (showClient) columns.push({ header: text.client, key: 'client', width: 25 });
  if (showProject) columns.push({ header: text.project, key: 'project', width: 30 });
  columns.push(
    { header: text.day, key: 'day', width: 11.71428571429 },
    { header: text.date, key: 'date', width: 14.14285714286 },
    { header: text.description, key: 'description', width: 40.28571428571 },
    { header: text.hours, key: 'hours', width: 10 },
  );
  // Le mode confidentiel retire toute information financière, à l'écran comme
  // dans le fichier transmis au client.
  if (!options.confidential) columns.push({ header: text.rate, key: 'rate', width: 14 }, { header: text.value, key: 'value', width: 16 });
  sheet.columns = columns;
  for (const row of rows) {
    const bank = bankByDate.get(`${row.projectId}:${row.workDate}`);
    // L'export destiné au client utilise directement le temps client enregistré
    // sur chaque entrée; le temps réellement travaillé demeure interne.
    const durationMinutes = row.clientMinutes;
    const exportedDescription = exportEntryDescriptionWithNotice(
      row.description,
      row.descriptionDocument,
      options.language,
    );
    const description = bank
      ? descriptionWithBankCode(
        exportedDescription,
        bank.openingMinutes,
        bank.movementMinutes,
        bank.closingMinutes,
      )
      : exportedDescription;
    const date = excelDate(row.workDate); const value: Record<string, unknown> = { day: text.days[date.getUTCDay()], date, description, hours: durationMinutes / 1440 };
    if (showClient) value.client = row.clientName; if (showProject) value.project = row.projectName;
    if (!options.confidential) { value.rate = Number(row.hourlyRate); value.value = (durationMinutes / 60) * Number(row.hourlyRate); }
    sheet.addRow(value);
  }
  if (!options.confidential && rows.length) {
    // Le total utilise une formule Excel et inclut aussi son résultat calculé
    // afin que les lecteurs ne recalculant pas les formules affichent la valeur.
    const totalHours = rows.reduce((sum, row) => sum + row.clientMinutes, 0) / 1440;
    const totalValue = rows.reduce((sum, row) => {
      const duration = row.clientMinutes;
      return sum + (duration / 60) * Number(row.hourlyRate);
    }, 0);
    const lastDetailRow = sheet.rowCount;
    const totalRow = sheet.addRow({ description: text.total, hours: { formula: `SUM(${sheet.getColumn('hours').letter}2:${sheet.getColumn('hours').letter}${lastDetailRow})`, result: totalHours }, value: { formula: `SUM(${sheet.getColumn('value').letter}2:${sheet.getColumn('value').letter}${lastDetailRow})`, result: totalValue } });
    totalRow.font = { bold: true, color: { argb: 'FF17324D' } }; totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FF' } };
  }
  // Style volontairement sobre et compatible avec l'ancienne application :
  // aucune couleur, aucun filtre automatique et aucune ligne figée.
  sheet.eachRow((row) => { row.font = { name: 'Arial', size: 10 }; });
  const header = sheet.getRow(1); header.alignment = { horizontal: 'center', vertical: 'bottom' };
  sheet.getColumn('date').numFmt = 'dd/mm/yyyy'; sheet.getColumn('date').alignment = { horizontal: 'center', vertical: 'top' };
  sheet.getColumn('hours').numFmt = 'HH:mm'; sheet.getColumn('hours').alignment = { horizontal: 'center', vertical: 'top' };
  sheet.getColumn('description').alignment = { horizontal: 'left', vertical: 'top', wrapText: false };
  if (!options.confidential) { sheet.getColumn('rate').numFmt = '"$"#,##0.00'; sheet.getColumn('value').numFmt = '"$"#,##0.00'; }
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    if (!sheet.getRow(row).height) sheet.getRow(row).height = 15;
    sheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { ...cell.alignment, vertical: 'top' };
    });
  }
  let selectedClient: string = text.allClients;
  if (options.clientId) {
    const [client] = await database.select({ name: clients.name }).from(clients).where(and(eq(clients.id, options.clientId), eq(clients.userId, user.id))).limit(1);
    selectedClient = client?.name ?? text.allClients;
  }
  const filename = `${filenamePart(`${user.firstName}${user.lastName}`)}_OnTime_${filenamePart(selectedClient)}_${filenameDate(options.from)}_to_${filenameDate(options.to)}.xlsx`;
  return { buffer: await workbook.xlsx.writeBuffer(), filename, rows };
};
