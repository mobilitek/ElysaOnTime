import { and, asc, eq, sql } from 'drizzle-orm';
import { database } from '../../database';
import { clients } from '../../db/schema';

export type ClientRecord = {
  id: string;
  name: string;
  isActive: boolean;
  hourBankEnabled: boolean;
  hourBankStartDate: string | null;
  hourBankInitialMinutes: number;
  maxDailyBillableMinutes: number;
  maxWeeklyBillableMinutes: number;
  createdAt: Date;
  updatedAt: Date;
};

export class DuplicateClientNameError extends Error {
  constructor() {
    super('A client with this name already exists');
    this.name = 'DuplicateClientNameError';
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super('Client not found');
    this.name = 'ClientNotFoundError';
  }
}

const normalizeName = (name: string): string => name.trim();

/**
 * Vérifie l'unicité insensible à la casse dans l'espace de noms de l'utilisateur.
 * La contrainte PostgreSQL correspondante protège aussi contre les courses.
 */
const assertUniqueName = async (
  userId: string,
  name: string,
  excludedClientId?: string,
): Promise<void> => {
  const conditions = [
    eq(clients.userId, userId),
    sql`lower(trim(${clients.name})) = ${name.toLowerCase()}`,
  ];

  if (excludedClientId) {
    conditions.push(sql`${clients.id} <> ${excludedClientId}`);
  }

  const existing = await database
    .select({ id: clients.id })
    .from(clients)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    throw new DuplicateClientNameError();
  }
};

export const listClients = async (userId: string): Promise<ClientRecord[]> =>
  // Les clients inactifs restent retournés dans l'écran de gestion afin qu'ils
  // puissent être réactivés; les écrans de saisie les filtrent côté interface.
  database
    .select({
      id: clients.id,
      name: clients.name,
      isActive: clients.isActive,
      hourBankEnabled: clients.hourBankEnabled,
      hourBankStartDate: clients.hourBankStartDate,
      hourBankInitialMinutes: clients.hourBankInitialMinutes,
      maxDailyBillableMinutes: clients.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: clients.maxWeeklyBillableMinutes,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .where(eq(clients.userId, userId))
    .orderBy(asc(clients.name));

export const createClient = async (userId: string, rawName: string): Promise<ClientRecord> => {
  const name = normalizeName(rawName);
  if (!name) {
    throw new Error('Client name is required');
  }

  await assertUniqueName(userId, name);
  const [client] = await database
    .insert(clients)
    .values({ userId, name })
    .returning({
      id: clients.id,
      name: clients.name,
      isActive: clients.isActive,
      hourBankEnabled: clients.hourBankEnabled,
      hourBankStartDate: clients.hourBankStartDate,
      hourBankInitialMinutes: clients.hourBankInitialMinutes,
      maxDailyBillableMinutes: clients.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: clients.maxWeeklyBillableMinutes,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    });

  if (!client) {
    throw new Error('Client creation failed');
  }
  return client;
};

export const updateClient = async (
  userId: string,
  clientId: string,
  input: {
    name?: string;
    isActive?: boolean;
    hourBankEnabled?: boolean;
    hourBankStartDate?: string | null;
    hourBankInitialMinutes?: number;
    maxDailyBillableMinutes?: number;
    maxWeeklyBillableMinutes?: number;
  },
): Promise<ClientRecord> => {
  // Inclure userId dans la recherche empêche de modifier le client d'un autre
  // compte en devinant ou en récupérant son identifiant.
  const [existing] = await database
    .select({
      id: clients.id,
      name: clients.name,
      hourBankEnabled: clients.hourBankEnabled,
      hourBankStartDate: clients.hourBankStartDate,
      maxDailyBillableMinutes: clients.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: clients.maxWeeklyBillableMinutes,
    })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new ClientNotFoundError();
  }

  const name = input.name === undefined ? existing.name : normalizeName(input.name);
  if (!name) {
    throw new Error('Client name is required');
  }
  if (name.toLowerCase() !== existing.name.trim().toLowerCase()) {
    await assertUniqueName(userId, name, clientId);
  }
  const hourBankEnabled = input.hourBankEnabled ?? existing.hourBankEnabled;
  const hourBankStartDate = input.hourBankStartDate === undefined
    ? existing.hourBankStartDate
    : input.hourBankStartDate;
  const maxDailyBillableMinutes = input.maxDailyBillableMinutes
    ?? existing.maxDailyBillableMinutes;
  const maxWeeklyBillableMinutes = input.maxWeeklyBillableMinutes
    ?? existing.maxWeeklyBillableMinutes;
  if (hourBankEnabled && !hourBankStartDate) {
    throw new Error('Hour bank start date is required');
  }
  if (maxDailyBillableMinutes <= 0 || maxWeeklyBillableMinutes <= 0) {
    throw new Error('Billable limits must be positive');
  }

  const [client] = await database
    .update(clients)
    .set({
      name,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.hourBankEnabled === undefined ? {} : { hourBankEnabled }),
      ...(input.hourBankStartDate === undefined ? {} : { hourBankStartDate }),
      ...(input.hourBankInitialMinutes === undefined
        ? {}
        : { hourBankInitialMinutes: input.hourBankInitialMinutes }),
      ...(input.maxDailyBillableMinutes === undefined
        ? {}
        : { maxDailyBillableMinutes }),
      ...(input.maxWeeklyBillableMinutes === undefined
        ? {}
        : { maxWeeklyBillableMinutes }),
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .returning({
      id: clients.id,
      name: clients.name,
      isActive: clients.isActive,
      hourBankEnabled: clients.hourBankEnabled,
      hourBankStartDate: clients.hourBankStartDate,
      hourBankInitialMinutes: clients.hourBankInitialMinutes,
      maxDailyBillableMinutes: clients.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: clients.maxWeeklyBillableMinutes,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    });

  if (!client) {
    throw new ClientNotFoundError();
  }
  return client;
};
