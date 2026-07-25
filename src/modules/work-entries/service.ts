import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { database } from '../../database';
import { clients, projects, workEntries } from '../../db/schema';

export class EntryNotFoundError extends Error {}
export class ProjectUnavailableError extends Error {}
export class InvalidDurationError extends Error {}
export class InvalidDescriptionError extends Error {}
export class ClientTimeLimitError extends Error {}

type EntryInput = {
  projectId: string;
  workDate: string;
  durationMinutes: number;
  clientMinutes?: number;
  description: string;
};
type EntryFilters = {
  from: string; to: string; clientId?: string; projectId?: string; includeDeleted: boolean;
  page: number; pageSize: number; sortBy: 'workDate' | 'client' | 'project' | 'duration' | 'hourlyRate' | 'amount' | 'isBilled';
  sortDirection: 'asc' | 'desc';
};

const visibleProject = async (userId: string, projectId: string) => {
  // Une entrée peut être créée ou manipulée seulement si son client ET son
  // projet sont actifs et appartiennent à l'utilisateur.
  const [row] = await database.select({ project: projects, client: clients })
    .from(projects).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(projects.id, projectId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true))).limit(1);
  if (!row) throw new ProjectUnavailableError('Active client and project required');
  return row;
};

const validate = (input: Pick<EntryInput, 'durationMinutes' | 'clientMinutes' | 'description'>) => {
  // La saisie courante impose des blocs de 15 minutes. Les valeurs historiques
  // atypiques restent néanmoins conservées lors des imports.
  if (
    input.durationMinutes < 0
    || input.durationMinutes % 15 !== 0
    || (input.clientMinutes !== undefined
      && (input.clientMinutes < 0 || input.clientMinutes % 15 !== 0))
  ) throw new InvalidDurationError('Durations must use 15-minute increments');
  if (!input.description.trim()) throw new InvalidDescriptionError('Description is required');
};

const amountFor = (duration: number, rate: string) => ((duration / 60) * Number(rate)).toFixed(2);

const weekBounds = (workDate: string) => {
  const date = new Date(`${workDate}T12:00:00Z`);
  const offset = (date.getUTCDay() + 1) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
};

/**
 * Normalise les heures client et vérifie les plafonds quotidiens et
 * hebdomadaires en tenant compte des autres entrées du même client.
 */
const clientTimeFor = async (
  userId: string,
  context: Awaited<ReturnType<typeof visibleProject>>,
  input: Pick<EntryInput, 'workDate' | 'durationMinutes' | 'clientMinutes'>,
  excludedEntryId?: string,
) => {
  const bankApplies = context.client.hourBankEnabled
    && context.client.hourBankStartDate
    && input.workDate >= context.client.hourBankStartDate;
  if (!bankApplies) return input.durationMinutes;

  const clientMinutes = input.clientMinutes ?? input.durationMinutes;
  if (clientMinutes > context.client.maxDailyBillableMinutes) {
    throw new ClientTimeLimitError('Daily client time exceeds the client limit');
  }
  const exclusion = excludedEntryId ? ne(workEntries.id, excludedEntryId) : undefined;
  const common = [
    eq(workEntries.userId, userId),
    eq(clients.id, context.client.id),
    eq(workEntries.isDeleted, false),
    ...(exclusion ? [exclusion] : []),
  ];
  const week = weekBounds(input.workDate);
  const [[day], [weekTotal]] = await Promise.all([
    database.select({
      minutes: sql<number>`coalesce(sum(${workEntries.clientMinutes}), 0)::int`,
    }).from(workEntries)
      .innerJoin(projects, eq(workEntries.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(and(...common, eq(workEntries.workDate, input.workDate))),
    database.select({
      minutes: sql<number>`coalesce(sum(${workEntries.clientMinutes}), 0)::int`,
    }).from(workEntries)
      .innerJoin(projects, eq(workEntries.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        ...common,
        gte(workEntries.workDate, week.from),
        lte(workEntries.workDate, week.to),
      )),
  ]);
  if (Number(day?.minutes ?? 0) + clientMinutes > context.client.maxDailyBillableMinutes) {
    throw new ClientTimeLimitError('Daily client time exceeds the client limit');
  }
  if (Number(weekTotal?.minutes ?? 0) + clientMinutes > context.client.maxWeeklyBillableMinutes) {
    throw new ClientTimeLimitError('Weekly client time exceeds the client limit');
  }
  return clientMinutes;
};

const selection = {
  id: workEntries.id, projectId: workEntries.projectId, clientId: clients.id,
  clientName: clients.name, projectName: projects.name, workDate: workEntries.workDate,
  durationMinutes: workEntries.durationMinutes, clientMinutes: workEntries.clientMinutes,
  description: workEntries.description,
  hourlyRate: workEntries.hourlyRate, amount: workEntries.amount,
  isBilled: workEntries.isBilled, isDeleted: workEntries.isDeleted,
  createdAt: workEntries.createdAt, updatedAt: workEntries.updatedAt,
};

export const listEntries = async (userId: string, filters: EntryFilters) => {
  // Le filtrage d'appartenance est répété dans la requête, même si l'utilisateur
  // est déjà authentifié, pour empêcher toute fuite intercompte.
  const conditions = [eq(workEntries.userId, userId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true), gte(workEntries.workDate, filters.from), lte(workEntries.workDate, filters.to)];
  if (filters.clientId) conditions.push(eq(clients.id, filters.clientId));
  if (filters.projectId) conditions.push(eq(projects.id, filters.projectId));
  if (!filters.includeDeleted) conditions.push(eq(workEntries.isDeleted, false));
  const where = and(...conditions);
  const orderColumns = {
    workDate: workEntries.workDate, client: clients.name, project: projects.name,
    duration: workEntries.durationMinutes, hourlyRate: workEntries.hourlyRate,
    amount: workEntries.amount, isBilled: workEntries.isBilled,
  } as const;
  const order = filters.sortDirection === 'asc' ? asc(orderColumns[filters.sortBy]) : desc(orderColumns[filters.sortBy]);
  // Charger en parallèle la page et les totaux de toute la sélection. Les totaux
  // ne sont donc pas limités aux lignes visibles sur la page courante.
  const [rows, [summary]] = await Promise.all([
    database.select(selection).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where).orderBy(order, desc(workEntries.createdAt)).limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
    database.select({
      itemCount: count(),
      totalMinutes: sql<number>`coalesce(sum(${workEntries.durationMinutes}), 0)::int`,
      totalClientMinutes: sql<number>`coalesce(sum(${workEntries.clientMinutes}), 0)::int`,
      totalActualAmount: sql<string>`coalesce(sum((${workEntries.durationMinutes}::numeric / 60) * ${workEntries.hourlyRate}), 0)::numeric(14,2)`,
      totalAmount: sql<string>`coalesce(sum(${workEntries.amount}), 0)::numeric(14,2)`,
    })
      .from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id)).where(where),
  ]);
  return { entries: rows, summary, page: filters.page, pageSize: filters.pageSize, pageCount: Math.max(1, Math.ceil(Number(summary?.itemCount ?? 0) / filters.pageSize)) };
};

export const createEntry = async (userId: string, input: EntryInput) => {
  validate(input); const context = await visibleProject(userId, input.projectId);
  const clientMinutes = await clientTimeFor(userId, context, input);
  // Copier le taux courant sur l'entrée constitue son taux historique.
  const [entry] = await database.insert(workEntries).values({
    userId,
    projectId: input.projectId,
    workDate: input.workDate,
    durationMinutes: input.durationMinutes,
    clientMinutes,
    description: input.description.trim(),
    hourlyRate: context.project.hourlyRate,
    amount: amountFor(clientMinutes, context.project.hourlyRate),
  }).returning();
  return entry;
};

export const updateEntry = async (userId: string, id: string, input: Omit<EntryInput, 'projectId'>) => {
  validate(input);
  const [current] = await database.select({ entry: workEntries, project: projects, client: clients }).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(workEntries.id, id), eq(workEntries.userId, userId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true))).limit(1);
  if (!current) throw new EntryNotFoundError('Entry not found');
  const clientMinutes = await clientTimeFor(userId, {
    project: current.project,
    client: current.client,
  }, input, id);
  // Le projet et le taux historique ne changent pas pendant l'édition; seul le
  // montant est recalculé à partir du taux déjà enregistré sur l'entrée.
  const [entry] = await database.update(workEntries).set({
    workDate: input.workDate,
    durationMinutes: input.durationMinutes,
    clientMinutes,
    description: input.description.trim(),
    amount: amountFor(clientMinutes, current.entry.hourlyRate),
    updatedAt: new Date(),
  }).where(eq(workEntries.id, id)).returning();
  return entry;
};

const requireEntries = async (userId: string, ids: string[]) => {
  // Toutes les lignes demandées doivent être accessibles. Une sélection mixte
  // valide/invalide est entièrement refusée au lieu d'être partiellement modifiée.
  const rows = await database.select({ id: workEntries.id }).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(inArray(workEntries.id, ids), eq(workEntries.userId, userId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true)));
  if (rows.length !== new Set(ids).size) throw new EntryNotFoundError('One or more entries are unavailable');
};

export const toggleEntries = async (userId: string, ids: string[], field: 'isBilled' | 'isDeleted') => {
  await requireEntries(userId, ids);
  const column = field === 'isBilled' ? workEntries.isBilled : workEntries.isDeleted;
  // Chaque valeur est inversée individuellement en fonction de son état actuel.
  return database.update(workEntries).set({ [field]: sql`not ${column}`, updatedAt: new Date() }).where(inArray(workEntries.id, ids)).returning({ id: workEntries.id, isBilled: workEntries.isBilled, isDeleted: workEntries.isDeleted });
};

/**
 * Calcule le prochain jour ouvrable : vendredi vers lundi, samedi vers lundi,
 * dimanche vers lundi, et une journée dans les autres cas.
 */
const nextBusinessDay = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`); const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 5 ? 3 : day === 6 ? 2 : day === 0 ? 1 : 1));
  return value.toISOString().slice(0, 10);
};

export const duplicateEntry = async (userId: string, id: string, nextWorkday: boolean) => {
  const [source] = await database.select({ entry: workEntries }).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(workEntries.id, id), eq(workEntries.userId, userId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true))).limit(1);
  if (!source) throw new EntryNotFoundError('Entry not found');
  const entry = source.entry;
  // Une copie reprend intégralement les valeurs historiques, mais commence
  // toujours comme une entrée visible et non facturée.
  const workDate = nextWorkday ? nextBusinessDay(entry.workDate) : entry.workDate;
  const context = await visibleProject(userId, entry.projectId);
  const clientMinutes = await clientTimeFor(userId, context, {
    workDate,
    durationMinutes: entry.durationMinutes,
    clientMinutes: entry.clientMinutes,
  });
  const [copy] = await database.insert(workEntries).values({
    userId,
    projectId: entry.projectId,
    workDate,
    durationMinutes: entry.durationMinutes,
    clientMinutes,
    description: entry.description,
    hourlyRate: entry.hourlyRate,
    amount: amountFor(clientMinutes, entry.hourlyRate),
    isBilled: false,
    isDeleted: false,
  }).returning();
  return copy;
};
