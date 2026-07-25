import { and, asc, eq, sql } from 'drizzle-orm';
import { database } from '../../database';
import { clients, projects, workEntries } from '../../db/schema';

export type RateUpdateMode = 'future_only' | 'update_unbilled';
export type ProjectRecord = {
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
  createdAt: Date;
  updatedAt: Date;
};

export class DuplicateProjectNameError extends Error {
  constructor() { super('A project with this name already exists for this client'); this.name = 'DuplicateProjectNameError'; }
}
export class ProjectNotFoundError extends Error {
  constructor() { super('Project not found'); this.name = 'ProjectNotFoundError'; }
}
export class ClientUnavailableError extends Error {
  constructor() { super('An active client is required'); this.name = 'ClientUnavailableError'; }
}
export class RateUpdateModeRequiredError extends Error {
  constructor() { super('Choose how the new rate applies to existing entries'); this.name = 'RateUpdateModeRequiredError'; }
}

const normalizeName = (name: string) => name.trim();
const normalizeRate = (rate: string): string => {
  // Le taux courant d'un projet ne peut pas être négatif. Les valeurs négatives
  // historiques demeurent permises uniquement sur les anciennes entrées.
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(rate)) throw new Error('Hourly rate must be a non-negative amount with two decimals');
  return Number(rate).toFixed(2);
};

const requireActiveClient = async (userId: string, clientId: string): Promise<void> => {
  // Un client inactif rend tous ses projets indisponibles, même si ceux-ci sont
  // encore marqués actifs dans la base de données.
  const [client] = await database.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId), eq(clients.isActive, true))).limit(1);
  if (!client) throw new ClientUnavailableError();
};

const assertUniqueName = async (clientId: string, name: string, excludedId?: string) => {
  const conditions = [eq(projects.clientId, clientId), sql`lower(trim(${projects.name})) = ${name.toLowerCase()}`];
  if (excludedId) conditions.push(sql`${projects.id} <> ${excludedId}`);
  const existing = await database.select({ id: projects.id }).from(projects).where(and(...conditions)).limit(1);
  if (existing.length) throw new DuplicateProjectNameError();
};

const projectSelection = {
  id: projects.id, clientId: projects.clientId, name: projects.name,
  hourlyRate: projects.hourlyRate, isActive: projects.isActive,
  hourBankEnabled: projects.hourBankEnabled,
  hourBankStartDate: projects.hourBankStartDate,
  hourBankInitialMinutes: projects.hourBankInitialMinutes,
  maxDailyBillableMinutes: projects.maxDailyBillableMinutes,
  maxWeeklyBillableMinutes: projects.maxWeeklyBillableMinutes,
  createdAt: projects.createdAt, updatedAt: projects.updatedAt,
};

export const listProjects = async (userId: string, clientId: string): Promise<ProjectRecord[]> => {
  // L'écran de gestion reçoit les projets actifs et inactifs du client actif
  // afin de pouvoir les réactiver au besoin.
  await requireActiveClient(userId, clientId);
  return database.select(projectSelection).from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(projects.clientId, clientId), eq(clients.userId, userId)))
    .orderBy(asc(projects.name));
};

export const createProject = async (
  userId: string,
  input: {
    clientId: string; name: string; hourlyRate: string;
    hourBankEnabled?: boolean; hourBankStartDate?: string | null;
    hourBankInitialMinutes?: number; maxDailyBillableMinutes?: number;
    maxWeeklyBillableMinutes?: number;
  },
): Promise<ProjectRecord> => {
  await requireActiveClient(userId, input.clientId);
  const name = normalizeName(input.name);
  if (!name) throw new Error('Project name is required');
  const hourlyRate = normalizeRate(input.hourlyRate);
  await assertUniqueName(input.clientId, name);

  if (input.hourBankEnabled && !input.hourBankStartDate) throw new Error('Hour bank start date is required');
  const [project] = await database.insert(projects).values({
    clientId: input.clientId, name, hourlyRate,
    hourBankEnabled: input.hourBankEnabled ?? false,
    hourBankStartDate: input.hourBankEnabled ? input.hourBankStartDate : null,
    hourBankInitialMinutes: input.hourBankInitialMinutes ?? 0,
    maxDailyBillableMinutes: input.maxDailyBillableMinutes ?? 480,
    maxWeeklyBillableMinutes: input.maxWeeklyBillableMinutes ?? 2400,
  })
    .returning(projectSelection);
  if (!project) throw new Error('Project creation failed');
  return project;
};

export const updateProject = async (
  userId: string,
  projectId: string,
  input: {
    name?: string; hourlyRate?: string; isActive?: boolean; rateUpdateMode?: RateUpdateMode;
    hourBankEnabled?: boolean; hourBankStartDate?: string | null;
    hourBankInitialMinutes?: number; maxDailyBillableMinutes?: number;
    maxWeeklyBillableMinutes?: number;
  },
): Promise<ProjectRecord> => {
  const [existing] = await database.select(projectSelection).from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(projects.id, projectId), eq(clients.userId, userId), eq(clients.isActive, true))).limit(1);
  if (!existing) throw new ProjectNotFoundError();

  const name = input.name === undefined ? existing.name : normalizeName(input.name);
  if (!name) throw new Error('Project name is required');
  if (name.toLowerCase() !== existing.name.trim().toLowerCase()) await assertUniqueName(existing.clientId, name, projectId);

  const hourlyRate = input.hourlyRate === undefined ? existing.hourlyRate : normalizeRate(input.hourlyRate);
  const rateChanged = hourlyRate !== Number(existing.hourlyRate).toFixed(2);
  // Une modification de taux exige une décision explicite : préserver tout
  // l'historique ou recalculer seulement les entrées non facturées.
  if (rateChanged && !input.rateUpdateMode) throw new RateUpdateModeRequiredError();
  const hourBankEnabled = input.hourBankEnabled ?? existing.hourBankEnabled;
  const hourBankStartDate = input.hourBankStartDate === undefined
    ? existing.hourBankStartDate
    : input.hourBankStartDate;
  const maxDailyBillableMinutes = input.maxDailyBillableMinutes
    ?? existing.maxDailyBillableMinutes;
  const maxWeeklyBillableMinutes = input.maxWeeklyBillableMinutes
    ?? existing.maxWeeklyBillableMinutes;
  if (hourBankEnabled && !hourBankStartDate) throw new Error('Hour bank start date is required');
  if (maxDailyBillableMinutes <= 0 || maxWeeklyBillableMinutes <= 0) {
    throw new Error('Billable limits must be positive');
  }

  // Le projet et les éventuelles entrées recalculées doivent changer ensemble.
  await database.transaction(async (transaction) => {
    await transaction.update(projects).set({
      name, hourlyRate,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.hourBankEnabled === undefined ? {} : { hourBankEnabled }),
      ...(input.hourBankStartDate === undefined ? {} : { hourBankStartDate }),
      ...(input.hourBankInitialMinutes === undefined
        ? {}
        : { hourBankInitialMinutes: input.hourBankInitialMinutes }),
      ...(input.maxDailyBillableMinutes === undefined ? {} : { maxDailyBillableMinutes }),
      ...(input.maxWeeklyBillableMinutes === undefined ? {} : { maxWeeklyBillableMinutes }),
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));

    if (rateChanged && input.rateUpdateMode === 'update_unbilled') {
      // Les entrées facturées conservent toujours leur taux historique.
      await transaction.update(workEntries).set({
        hourlyRate,
        amount: sql`round((${workEntries.clientMinutes}::numeric / 60) * ${hourlyRate}::numeric, 2)`,
        updatedAt: new Date(),
      }).where(and(eq(workEntries.projectId, projectId), eq(workEntries.isBilled, false)));
    }
  });

  const [updated] = await database.select(projectSelection).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!updated) throw new ProjectNotFoundError();
  return updated;
};
