import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  type LegacyEntry,
  readLegacyWorkbookBuffer,
  summarizeLegacyEntries,
} from '../../commands/import-legacy-excel';
import { database } from '../../database';
import { clients, projects, workEntries } from '../../db/schema';

export class InvalidImportFileError extends Error {}
export class ImportReconciliationError extends Error {}

export type ImportAnalysis = ReturnType<typeof summarizeLegacyEntries> & {
  digest: string;
  duplicateRows: number;
  zeroMinuteEntries: number;
  negativeRateEntries: number;
};

const projectKey = (clientName: string, projectName: string) =>
  `${clientName.trim().toLocaleLowerCase('fr-CA')}\u001f${projectName.trim().toLocaleLowerCase('fr-CA')}`;

export const parseImportFile = async (file: File): Promise<{ entries: LegacyEntry[]; analysis: ImportAnalysis }> => {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new InvalidImportFileError('XLSX_REQUIRED');
  if (file.size > 25 * 1024 * 1024) throw new InvalidImportFileError('FILE_TOO_LARGE');
  const buffer = await file.arrayBuffer();
  let entries: LegacyEntry[];
  try {
    entries = await readLegacyWorkbookBuffer(buffer);
  } catch (error) {
    throw new InvalidImportFileError(error instanceof Error ? error.message : 'INVALID_WORKBOOK');
  }
  if (!entries.length) throw new InvalidImportFileError('EMPTY_WORKBOOK');
  const descriptions = new Map<string, number>();
  for (const entry of entries) {
    const base = entry.description.replace(/-\d+$/, '');
    descriptions.set(base, (descriptions.get(base) ?? 0) + 1);
  }
  return {
    entries,
    analysis: {
      ...summarizeLegacyEntries(entries),
      digest: createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),
      duplicateRows: [...descriptions.values()].reduce((sum, count) => sum + (count > 1 ? count : 0), 0),
      zeroMinuteEntries: entries.filter((entry) => entry.durationMinutes === 0).length,
      negativeRateEntries: entries.filter((entry) => Number(entry.hourlyRate) < 0).length,
    },
  };
};

export const replaceUserData = async (userId: string, entries: LegacyEntry[]) => {
  const expected = summarizeLegacyEntries(entries);
  await database.transaction(async (transaction) => {
    const existingClients = await transaction.select({ id: clients.id }).from(clients).where(eq(clients.userId, userId));
    const clientIds = existingClients.map((client) => client.id);
    await transaction.delete(workEntries).where(eq(workEntries.userId, userId));
    if (clientIds.length) {
      const existingProjects = await transaction.select({ id: projects.id }).from(projects).where(inArray(projects.clientId, clientIds));
      if (existingProjects.length) await transaction.delete(projects).where(inArray(projects.id, existingProjects.map((project) => project.id)));
      await transaction.delete(clients).where(inArray(clients.id, clientIds));
    }

    const canonicalClients = new Map<string, string>();
    for (const entry of entries) {
      const key = entry.clientName.toLocaleLowerCase('fr-CA');
      if (!canonicalClients.has(key)) canonicalClients.set(key, entry.clientName);
    }
    const insertedClients = await transaction.insert(clients)
      .values([...canonicalClients.values()].map((name) => ({ userId, name, isActive: true })))
      .returning({ id: clients.id, name: clients.name });
    const clientIdsByName = new Map(insertedClients.map((client) => [client.name.toLocaleLowerCase('fr-CA'), client.id]));

    const latestEntryByProject = new Map<string, LegacyEntry>();
    for (const entry of entries) {
      const key = projectKey(entry.clientName, entry.projectName);
      const current = latestEntryByProject.get(key);
      if (!current || entry.workDate > current.workDate) latestEntryByProject.set(key, entry);
    }
    const insertedProjects = await transaction.insert(projects).values(
      [...latestEntryByProject.values()].map((entry) => ({
        clientId: clientIdsByName.get(entry.clientName.toLocaleLowerCase('fr-CA'))!,
        name: entry.projectName,
        hourlyRate: Number(entry.hourlyRate) < 0 ? '0.00' : entry.hourlyRate,
        isActive: true,
      })),
    ).returning({ id: projects.id, clientId: projects.clientId, name: projects.name });
    const clientNamesById = new Map(insertedClients.map((client) => [client.id, client.name]));
    const projectIdsByName = new Map(insertedProjects.map((project) => [
      projectKey(clientNamesById.get(project.clientId)!, project.name),
      project.id,
    ]));

    await transaction.insert(workEntries).values(entries.map((entry) => ({
      userId,
      projectId: projectIdsByName.get(projectKey(entry.clientName, entry.projectName))!,
      workDate: entry.workDate,
      durationMinutes: entry.durationMinutes,
      description: entry.description,
      hourlyRate: entry.hourlyRate,
      amount: entry.amount,
      isBilled: entry.isBilled,
      isDeleted: false,
    })));

    const [actual] = await transaction.select({
      entries: sql<number>`count(*)::int`,
      billed: sql<number>`count(*) filter (where ${workEntries.isBilled})::int`,
      deleted: sql<number>`count(*) filter (where ${workEntries.isDeleted})::int`,
      totalMinutes: sql<number>`coalesce(sum(${workEntries.durationMinutes}), 0)::int`,
      totalAmount: sql<string>`coalesce(sum(${workEntries.amount}), 0)::numeric(14,2)`,
    }).from(workEntries).where(eq(workEntries.userId, userId));
    const actualComparable = {
      entries: actual?.entries ?? 0,
      billed: actual?.billed ?? 0,
      deleted: actual?.deleted ?? 0,
      totalMinutes: actual?.totalMinutes ?? 0,
      totalAmount: actual?.totalAmount ?? '0.00',
    };
    const expectedComparable = {
      entries: expected.entries,
      billed: expected.billed,
      deleted: expected.deleted,
      totalMinutes: expected.totalMinutes,
      totalAmount: expected.totalAmount,
    };
    if (JSON.stringify(actualComparable) !== JSON.stringify(expectedComparable)) {
      throw new ImportReconciliationError(JSON.stringify({ expected: expectedComparable, actual: actualComparable }));
    }
  });
  return expected;
};
