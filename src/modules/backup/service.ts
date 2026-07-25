import { createHash } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { database } from '../../database';
import {
  clients,
  hourBankClosures,
  hourBankDays,
  projects,
  workEntries,
} from '../../db/schema';

export const BACKUP_FORMAT = 'ontime-backup';
export const BACKUP_VERSION = 1;
// Limite défensive : le fichier complet est chargé en mémoire avant validation.
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
  hourBankEnabled?: boolean;
  hourBankStartDate?: string | null;
  hourBankInitialMinutes?: number;
  maxDailyBillableMinutes?: number;
  maxWeeklyBillableMinutes?: number;
  createdAt: string;
  updatedAt: string;
};
type BackupProject = {
  id: string;
  clientId: string;
  name: string;
  hourlyRate: string;
  isActive: boolean;
  hourBankEnabled: boolean;
  hourBankStartDate: string | null;
  hourBankInitialMinutes: number;
  maxDailyBillableMinutes: number;
  maxWeeklyBillableMinutes: number;
  createdAt: string;
  updatedAt: string;
};
type BackupEntry = {
  id: string;
  projectId: string;
  workDate: string;
  durationMinutes: number;
  clientMinutes: number;
  description: string;
  hourlyRate: string;
  amount: string;
  isBilled: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};
type BackupClosure = {
  id: string;
  projectId: string;
  weekStart: string;
  weekEnd: string;
  actualMinutes: number;
  billedMinutes: number;
  movementMinutes: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};
type BackupHourBankDay = {
  id: string;
  closureId: string;
  workDate: string;
  actualMinutes: number;
  billedMinutes: number;
  movementMinutes: number;
  createdAt: string;
};
export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: {
    clients: BackupClient[];
    projects: BackupProject[];
    workEntries: BackupEntry[];
    hourBankClosures: BackupClosure[];
    hourBankDays: BackupHourBankDay[];
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
const integer = (value: unknown, field: string, minimum?: number) => {
  if (!Number.isInteger(value) || (minimum !== undefined && Number(value) < minimum)) {
    throw new InvalidBackupFileError(`INVALID_${field.toUpperCase()}`);
  }
  return Number(value);
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
  // La validation est volontairement stricte : aucune donnée n'est écrite tant
  // que le format, les types et toutes les relations n'ont pas été vérifiés.
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || !isRecord(value.data)) {
    throw new InvalidBackupFileError('UNSUPPORTED_BACKUP_FORMAT');
  }
  const rawClients = value.data.clients;
  const rawProjects = value.data.projects;
  const rawEntries = value.data.workEntries;
  // Ces collections et propriétés sont facultatives dans les sauvegardes
  // créées avant l'introduction de la banque d'heures.
  const rawClosures = value.data.hourBankClosures ?? [];
  const rawDays = value.data.hourBankDays ?? [];
  if (!Array.isArray(rawClients) || !Array.isArray(rawProjects) || !Array.isArray(rawEntries) || !Array.isArray(rawClosures) || !Array.isArray(rawDays)) {
    throw new InvalidBackupFileError('INVALID_BACKUP_DATA');
  }

  const parsedClients = rawClients.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_CLIENT');
    return {
      id: requiredString(row.id, 'client_id', uuidPattern),
      name: requiredString(row.name, 'client_name'),
      isActive: requiredBoolean(row.isActive, 'client_active'),
      hourBankEnabled: row.hourBankEnabled === undefined
        ? false
        : requiredBoolean(row.hourBankEnabled, 'client_hour_bank_enabled'),
      hourBankStartDate: row.hourBankStartDate === undefined || row.hourBankStartDate === null
        ? null
        : requiredString(row.hourBankStartDate, 'client_hour_bank_start_date', datePattern),
      hourBankInitialMinutes: row.hourBankInitialMinutes === undefined
        ? 0
        : integer(row.hourBankInitialMinutes, 'client_hour_bank_initial_minutes'),
      maxDailyBillableMinutes: row.maxDailyBillableMinutes === undefined
        ? 480
        : integer(row.maxDailyBillableMinutes, 'client_daily_maximum', 1),
      maxWeeklyBillableMinutes: row.maxWeeklyBillableMinutes === undefined
        ? 2400
        : integer(row.maxWeeklyBillableMinutes, 'client_weekly_maximum', 1),
      createdAt: timestamp(row.createdAt, 'client_created_at'),
      updatedAt: timestamp(row.updatedAt, 'client_updated_at'),
    };
  });
  const parsedProjects = rawProjects.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_PROJECT');
    const legacyClient = parsedClients.find((client) => client.id === row.clientId);
    return {
      id: requiredString(row.id, 'project_id', uuidPattern),
      clientId: requiredString(row.clientId, 'project_client_id', uuidPattern),
      name: requiredString(row.name, 'project_name'),
      hourlyRate: requiredString(row.hourlyRate, 'project_hourly_rate', unsignedDecimalPattern),
      isActive: requiredBoolean(row.isActive, 'project_active'),
      hourBankEnabled: row.hourBankEnabled === undefined
        ? legacyClient?.hourBankEnabled ?? false
        : requiredBoolean(row.hourBankEnabled, 'project_hour_bank_enabled'),
      hourBankStartDate: row.hourBankStartDate === undefined
        ? legacyClient?.hourBankStartDate ?? null
        : row.hourBankStartDate === null
          ? null
          : requiredString(row.hourBankStartDate, 'project_hour_bank_start_date', datePattern),
      hourBankInitialMinutes: row.hourBankInitialMinutes === undefined
        ? legacyClient?.hourBankInitialMinutes ?? 0
        : integer(row.hourBankInitialMinutes, 'project_hour_bank_initial_minutes'),
      maxDailyBillableMinutes: row.maxDailyBillableMinutes === undefined
        ? legacyClient?.maxDailyBillableMinutes ?? 480
        : integer(row.maxDailyBillableMinutes, 'project_daily_maximum', 1),
      maxWeeklyBillableMinutes: row.maxWeeklyBillableMinutes === undefined
        ? legacyClient?.maxWeeklyBillableMinutes ?? 2400
        : integer(row.maxWeeklyBillableMinutes, 'project_weekly_maximum', 1),
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
      clientMinutes: row.clientMinutes === undefined
        ? Number(durationMinutes)
        : integer(row.clientMinutes, 'entry_client_minutes', 0),
      description: requiredString(row.description, 'description'),
      // Les imports historiques peuvent légitimement contenir des ajustements négatifs.
      hourlyRate: requiredString(row.hourlyRate, 'entry_hourly_rate', signedDecimalPattern),
      amount: requiredString(row.amount, 'entry_amount', signedDecimalPattern),
      isBilled: requiredBoolean(row.isBilled, 'entry_billed'),
      isDeleted: requiredBoolean(row.isDeleted, 'entry_deleted'),
      createdAt: timestamp(row.createdAt, 'entry_created_at'),
      updatedAt: timestamp(row.updatedAt, 'entry_updated_at'),
    };
  });
  const parsedClosures = rawClosures.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_HOUR_BANK_CLOSURE');
    return {
      id: requiredString(row.id, 'closure_id', uuidPattern),
      projectId: row.projectId === undefined
        ? parsedProjects.find((project) => project.clientId === row.clientId)?.id
          ?? requiredString(row.projectId, 'closure_project_id', uuidPattern)
        : requiredString(row.projectId, 'closure_project_id', uuidPattern),
      weekStart: requiredString(row.weekStart, 'closure_week_start', datePattern),
      weekEnd: requiredString(row.weekEnd, 'closure_week_end', datePattern),
      actualMinutes: integer(row.actualMinutes, 'closure_actual_minutes', 0),
      billedMinutes: integer(row.billedMinutes, 'closure_billed_minutes', 0),
      movementMinutes: integer(row.movementMinutes, 'closure_movement_minutes'),
      note: typeof row.note === 'string' ? row.note : '',
      createdAt: timestamp(row.createdAt, 'closure_created_at'),
      updatedAt: timestamp(row.updatedAt, 'closure_updated_at'),
    };
  });
  const parsedDays = rawDays.map((row) => {
    if (!isRecord(row)) throw new InvalidBackupFileError('INVALID_HOUR_BANK_DAY');
    return {
      id: requiredString(row.id, 'hour_bank_day_id', uuidPattern),
      closureId: requiredString(row.closureId, 'hour_bank_day_closure_id', uuidPattern),
      workDate: requiredString(row.workDate, 'hour_bank_day_date', datePattern),
      actualMinutes: integer(row.actualMinutes, 'hour_bank_day_actual_minutes', 0),
      billedMinutes: integer(row.billedMinutes, 'hour_bank_day_billed_minutes', 0),
      movementMinutes: integer(row.movementMinutes, 'hour_bank_day_movement_minutes'),
      createdAt: timestamp(row.createdAt, 'hour_bank_day_created_at'),
    };
  });

  uniqueIds(parsedClients, 'client');
  uniqueIds(parsedProjects, 'project');
  uniqueIds(parsedEntries, 'entry');
  uniqueIds(parsedClosures, 'closure');
  uniqueIds(parsedDays, 'hour_bank_day');
  const clientIds = new Set(parsedClients.map((row) => row.id));
  const projectIds = new Set(parsedProjects.map((row) => row.id));
  const closureIds = new Set(parsedClosures.map((row) => row.id));
  // Vérifier les références avant la transaction produit des erreurs lisibles
  // et empêche toute restauration partielle ou incohérente.
  if (parsedProjects.some((row) => !clientIds.has(row.clientId))) throw new InvalidBackupFileError('UNKNOWN_CLIENT');
  if (parsedEntries.some((row) => !projectIds.has(row.projectId))) throw new InvalidBackupFileError('UNKNOWN_PROJECT');
  if (parsedClosures.some((row) => !projectIds.has(row.projectId))) throw new InvalidBackupFileError('UNKNOWN_CLOSURE_PROJECT');
  if (parsedDays.some((row) => !closureIds.has(row.closureId))) throw new InvalidBackupFileError('UNKNOWN_HOUR_BANK_CLOSURE');
  if (parsedClosures.some((row) => row.movementMinutes !== row.actualMinutes - row.billedMinutes)) {
    throw new InvalidBackupFileError('INVALID_CLOSURE_MOVEMENT');
  }
  if (parsedDays.some((row) => row.movementMinutes !== row.actualMinutes - row.billedMinutes)) {
    throw new InvalidBackupFileError('INVALID_HOUR_BANK_DAY_MOVEMENT');
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: timestamp(value.exportedAt, 'exported_at'),
    data: {
      clients: parsedClients,
      projects: parsedProjects,
      workEntries: parsedEntries,
      hourBankClosures: parsedClosures,
      hourBankDays: parsedDays,
    },
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
      // Le condensat lie l'analyse au fichier restauré. Si le fichier change
      // après l'écran de confirmation, la restauration sera refusée.
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
  // Le document contient seulement les données appartenant à l'utilisateur.
  // Les identifiants originaux sont conservés pour reconstruire les relations.
  const clientRows = await database.select().from(clients).where(eq(clients.userId, userId)).orderBy(asc(clients.createdAt));
  const clientIds = clientRows.map((row) => row.id);
  const projectRows = clientIds.length
    ? await database.select().from(projects).where(inArray(projects.clientId, clientIds)).orderBy(asc(projects.createdAt))
    : [];
  const entryRows = await database.select().from(workEntries).where(eq(workEntries.userId, userId)).orderBy(asc(workEntries.createdAt));
  const closureRows = await database.select().from(hourBankClosures).where(eq(hourBankClosures.userId, userId)).orderBy(asc(hourBankClosures.weekStart));
  const closureIds = closureRows.map((row) => row.id);
  const dayRows = closureIds.length
    ? await database.select().from(hourBankDays).where(inArray(hourBankDays.closureId, closureIds)).orderBy(asc(hourBankDays.workDate))
    : [];
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      clients: clientRows.map(({ userId: _userId, createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      projects: projectRows.map(({ createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      workEntries: entryRows.map(({ userId: _userId, createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      hourBankClosures: closureRows.map(({ userId: _userId, createdAt, updatedAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })),
      hourBankDays: dayRows.map(({ createdAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString() })),
    },
  };
};

export const restoreBackup = async (userId: string, backup: BackupDocument) => {
  // La restauration remplace toutes les données métier de l'utilisateur dans
  // une transaction unique. Son compte et les données des autres utilisateurs
  // ne sont jamais supprimés.
  await database.transaction(async (transaction) => {
    const currentClients = await transaction.select({ id: clients.id }).from(clients).where(eq(clients.userId, userId));
    const currentClientIds = currentClients.map((row) => row.id);
    await transaction.delete(workEntries).where(eq(workEntries.userId, userId));
    await transaction.delete(hourBankClosures).where(eq(hourBankClosures.userId, userId));
    if (currentClientIds.length) {
      await transaction.delete(projects).where(inArray(projects.clientId, currentClientIds));
      await transaction.delete(clients).where(inArray(clients.id, currentClientIds));
    }
    if (backup.data.clients.length) {
      await transaction.insert(clients).values(backup.data.clients.map((row) => ({
        id: row.id, name: row.name, isActive: row.isActive,
        userId, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
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
    if (backup.data.hourBankClosures.length) {
      await transaction.insert(hourBankClosures).values(backup.data.hourBankClosures.map((row) => ({
        ...row, userId, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
      })));
    }
    if (backup.data.hourBankDays.length) {
      await transaction.insert(hourBankDays).values(backup.data.hourBankDays.map((row) => ({
        ...row, createdAt: new Date(row.createdAt),
      })));
    }
  });
  return {
    clients: backup.data.clients.length,
    projects: backup.data.projects.length,
    entries: backup.data.workEntries.length,
  };
};
