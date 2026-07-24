import { createHash } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { database } from '../../database';
import { clients, projects, workEntries } from '../../db/schema';

export const BACKUP_FORMAT = 'ontime-backup';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_SIZE = 25 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const unsignedDecimalPattern = /^\d{1,10}(?:\.\d{1,2})?$/;
const signedDecimalPattern = /^-?\d{1,10}(?:\.\d{1,2})?$/;

export class InvalidBackupFileError extends Error {}

type BackupClient = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
type BackupProject = BackupClient & {
  clientId: string;
  hourlyRate: string;
};
type BackupEntry = {
  id: string;
  projectId: string;
  workDate: string;
  durationMinutes: number;
  description: string;
  hourlyRate: string;
  amount: string;
  isBilled: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};
export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: {
    clients: BackupClient[];
    projects: BackupProject[];
    workEntries: BackupEntry[];
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const requiredString = (value: unknown, field: string, pattern?: RegExp) => {
  if (typeof value !== 'string' || !value.length || (pattern && !pattern.test(value))) {
    throw new InvalidBackupFileError(`INVALID_${field.toUpperCase()}`);
  }
  return value;
};
const requiredBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') throw new InvalidBackupFileError(`INVALID_${field.toUpperCase()}`);
  return value;
};
const timestamp = (value: unknown, field: string) => {
  const text = requiredString(value, field);
  if (!Number.isFinite(Date.parse(text))) throw new InvalidBackupFileError(`INVALID_${field.toUpperCase()}`);
  return new Date(text).toISOString();
};
const uniqueIds = (rows: { id: string }[], field: string) => {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new InvalidBackupFileError(`DUPLICATE_${field.toUpperCase()}_ID`);
  }
};

export const validateBackup = (value: unknown): BackupDocument => {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || !isRecord(value.data)) {
    throw new InvalidBackupFileError('UNSUPPORTED_BACKUP_FORMAT');
  }
  const rawClients = value.data.clients;
  const rawProjects = value.data.projects;
  const rawEntries = value.data.workEntries;
  if (!Array.isArray(rawClients) || !Array.isArray(rawProjects) || !Array.isArray(rawEntries)) {
    throw new InvalidBackupFileError('INVALID_BACKUP_DATA');
  }

  const parsedClients = rawClients.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_CLIENT');
    return {
      id: requiredString(row.id, 'client_id', uuidPattern),
      name: requiredString(row.name, 'client_name'),
      isActive: requiredBoolean(row.isActive, 'client_active'),
      createdAt: timestamp(row.createdAt, 'client_created_at'),
      updatedAt: timestamp(row.updatedAt, 'client_updated_at'),
    };
  });
  const parsedProjects = rawProjects.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_PROJECT');
    return {
      id: requiredString(row.id, 'project_id', uuidPattern),
      clientId: requiredString(row.clientId, 'project_client_id', uuidPattern),
      name: requiredString(row.name, 'project_name'),
      hourlyRate: requiredString(row.hourlyRate, 'project_hourly_rate', unsignedDecimalPattern),
      isActive: requiredBoolean(row.isActive, 'project_active'),
      createdAt: timestamp(row.createdAt, 'project_created_at'),
      updatedAt: timestamp(row.updatedAt, 'project_updated_at'),
    };
  });
  const parsedEntries = rawEntries.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_WORK_ENTRY');
    const durationMinutes = row.durationMinutes;
    if (!Number.isInteger(durationMinutes) || Number(durationMinutes) < 0) {
      throw new InvalidBackupFileError('INVALID_DURATION_MINUTES');
    }
    return {
      id: requiredString(row.id, 'entry_id', uuidPattern),
      projectId: requiredString(row.projectId, 'entry_project_id', uuidPattern),
      workDate: requiredString(row.workDate, 'work_date', datePattern),
      durationMinutes: Number(durationMinutes),
      description: requiredString(row.description, 'description'),
      // Historical imports can legitimately contain negative adjustments.
      hourlyRate: requiredString(row.hourlyRate, 'entry_hourly_rate', signedDecimalPattern),
      amount: requiredString(row.amount, 'entry_amount', signedDecimalPattern),
      isBilled: requiredBoolean(row.isBilled, 'entry_billed'),
      isDeleted: requiredBoolean(row.isDeleted, 'entry_deleted'),
      createdAt: timestamp(row.createdAt, 'entry_created_at'),
      updatedAt: timestamp(row.updatedAt, 'entry_updated_at'),
    };
  });

  uniqueIds(parsedClients, 'client');
  uniqueIds(parsedProjects, 'project');
  uniqueIds(parsedEntries, 'entry');
  const clientIds = new Set(parsedClients.map((row) => row.id));
  const projectIds = new Set(parsedProjects.map((row) => row.id));
  if (parsedProjects.some((row) => !clientIds.has(row.clientId))) throw new InvalidBackupFileError('UNKNOWN_CLIENT');
  if (parsedEntries.some((row) => !projectIds.has(row.projectId))) throw new InvalidBackupFileError('UNKNOWN_PROJECT');

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: timestamp(value.exportedAt, 'exported_at'),
    data: { clients: parsedClients, projects: parsedProjects, workEntries: parsedEntries },
  };
};

export const parseBackupFile = async (file: File) => {
  if (!file.name.toLowerCase().endsWith('.json')) throw new InvalidBackupFileError('JSON_REQUIRED');
  if (file.size > MAX_BACKUP_SIZE) throw new InvalidBackupFileError('FILE_TOO_LARGE');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InvalidBackupFileError('INVALID_JSON');
  }
  const backup = validateBackup(raw);
  const entries = backup.data.workEntries;
  return {
    backup,
    analysis: {
      digest: createHash('sha256').update(bytes).digest('hex'),
      clients: backup.data.clients.length,
      projects: backup.data.projects.length,
      entries: entries.length,
      billed: entries.filter((entry) => entry.isBilled).length,
      deleted: entries.filter((entry) => entry.isDeleted).length,
      totalMinutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
      totalAmount: entries.reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2),
      firstDate: entries.reduce<string | null>((first, entry) => !first || entry.workDate < first ? entry.workDate : first, null),
      lastDate: entries.reduce<string | null>((last, entry) => !last || entry.workDate > last ? entry.workDate : last, null),
    },
  };
};

export const createBackup = async (userId: string): Promise<BackupDocument> => {
  const clientRows = await database.select().from(clients).where(eq(clients.userId, userId)).orderBy(asc(clients.createdAt));
  const clientIds = clientRows.map((row) => row.id);
  const projectRows = clientIds.length
    ? await database.select().from(projects).where(inArray(projects.clientId, clientIds)).orderBy(asc(projects.createdAt))
    : [];
  const entryRows = await database.select().from(workEntries).where(eq(workEntries.userId, userId)).orderBy(asc(workEntries.createdAt));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      clients: clientRows.map(({ userId: _userId, createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      projects: projectRows.map(({ createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      workEntries: entryRows.map(({ userId: _userId, createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
    },
  };
};

export const restoreBackup = async (userId: string, backup: BackupDocument) => {
  await database.transaction(async (transaction) => {
    const currentClients = await transaction.select({ id: clients.id }).from(clients).where(eq(clients.userId, userId));
    const currentClientIds = currentClients.map((row) => row.id);
    await transaction.delete(workEntries).where(eq(workEntries.userId, userId));
    if (currentClientIds.length) {
      await transaction.delete(projects).where(inArray(projects.clientId, currentClientIds));
      await transaction.delete(clients).where(inArray(clients.id, currentClientIds));
    }
    if (backup.data.clients.length) {
      await transaction.insert(clients).values(backup.data.clients.map((row) => ({
        ...row, userId, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
      })));
    }
    if (backup.data.projects.length) {
      await transaction.insert(projects).values(backup.data.projects.map((row) => ({
        ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
      })));
    }
    if (backup.data.workEntries.length) {
      await transaction.insert(workEntries).values(backup.data.workEntries.map((row) => ({
        ...row, userId, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
      })));
    }
  });
  return {
    clients: backup.data.clients.length,
    projects: backup.data.projects.length,
    entries: backup.data.workEntries.length,
  };
};
