import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { database } from '../../database';
import { clients, projects, workEntries } from '../../db/schema';

export class EntryNotFoundError extends Error {}
export class ProjectUnavailableError extends Error {}
export class InvalidDurationError extends Error {}
export class InvalidDescriptionError extends Error {}

type EntryInput = { projectId: string; workDate: string; durationMinutes: number; description: string };
type EntryFilters = {
  from: string; to: string; clientId?: string; projectId?: string; includeDeleted: boolean;
  page: number; pageSize: number; sortBy: 'workDate' | 'client' | 'project' | 'duration' | 'hourlyRate' | 'amount' | 'isBilled';
  sortDirection: 'asc' | 'desc';
};

const visibleProject = async (userId: string, projectId: string) => {
  const [row] = await database.select({ project: projects, clientName: clients.name })
    .from(projects).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(projects.id, projectId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true))).limit(1);
  if (!row) throw new ProjectUnavailableError('Active client and project required');
  return row;
};

const validate = (input: Pick<EntryInput, 'durationMinutes' | 'description'>) => {
  if (input.durationMinutes < 15 || input.durationMinutes % 15 !== 0) throw new InvalidDurationError('Duration must be a multiple of 15 minutes');
  if (!input.description.trim()) throw new InvalidDescriptionError('Description is required');
};

const amountFor = (duration: number, rate: string) => ((duration / 60) * Number(rate)).toFixed(2);

const selection = {
  id: workEntries.id, projectId: workEntries.projectId, clientId: clients.id,
  clientName: clients.name, projectName: projects.name, workDate: workEntries.workDate,
  durationMinutes: workEntries.durationMinutes, description: workEntries.description,
  hourlyRate: workEntries.hourlyRate, amount: workEntries.amount,
  isBilled: workEntries.isBilled, isDeleted: workEntries.isDeleted,
  createdAt: workEntries.createdAt, updatedAt: workEntries.updatedAt,
};

export const listEntries = async (userId: string, filters: EntryFilters) => {
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
  const [rows, [summary]] = await Promise.all([
    database.select(selection).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where).orderBy(order, desc(workEntries.createdAt)).limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
    database.select({ itemCount: count(), totalMinutes: sql<number>`coalesce(sum(${workEntries.durationMinutes}), 0)::int`, totalAmount: sql<string>`coalesce(sum(${workEntries.amount}), 0)::numeric(14,2)` })
      .from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id)).where(where),
  ]);
  return { entries: rows, summary, page: filters.page, pageSize: filters.pageSize, pageCount: Math.max(1, Math.ceil(Number(summary?.itemCount ?? 0) / filters.pageSize)) };
};

export const createEntry = async (userId: string, input: EntryInput) => {
  validate(input); const context = await visibleProject(userId, input.projectId);
  const [entry] = await database.insert(workEntries).values({ userId, projectId: input.projectId, workDate: input.workDate, durationMinutes: input.durationMinutes, description: input.description.trim(), hourlyRate: context.project.hourlyRate, amount: amountFor(input.durationMinutes, context.project.hourlyRate) }).returning();
  return entry;
};

export const updateEntry = async (userId: string, id: string, input: Omit<EntryInput, 'projectId'>) => {
  validate(input);
  const [current] = await database.select({ entry: workEntries, projectId: projects.id }).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(workEntries.id, id), eq(workEntries.userId, userId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true))).limit(1);
  if (!current) throw new EntryNotFoundError('Entry not found');
  const [entry] = await database.update(workEntries).set({ workDate: input.workDate, durationMinutes: input.durationMinutes, description: input.description.trim(), amount: amountFor(input.durationMinutes, current.entry.hourlyRate), updatedAt: new Date() }).where(eq(workEntries.id, id)).returning();
  return entry;
};

const requireEntries = async (userId: string, ids: string[]) => {
  const rows = await database.select({ id: workEntries.id }).from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(inArray(workEntries.id, ids), eq(workEntries.userId, userId), eq(clients.userId, userId), eq(clients.isActive, true), eq(projects.isActive, true)));
  if (rows.length !== new Set(ids).size) throw new EntryNotFoundError('One or more entries are unavailable');
};

export const toggleEntries = async (userId: string, ids: string[], field: 'isBilled' | 'isDeleted') => {
  await requireEntries(userId, ids);
  const column = field === 'isBilled' ? workEntries.isBilled : workEntries.isDeleted;
  return database.update(workEntries).set({ [field]: sql`not ${column}`, updatedAt: new Date() }).where(inArray(workEntries.id, ids)).returning({ id: workEntries.id, isBilled: workEntries.isBilled, isDeleted: workEntries.isDeleted });
};

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
  const [copy] = await database.insert(workEntries).values({ userId, projectId: entry.projectId, workDate: nextWorkday ? nextBusinessDay(entry.workDate) : entry.workDate, durationMinutes: entry.durationMinutes, description: entry.description, hourlyRate: entry.hourlyRate, amount: entry.amount, isBilled: false, isDeleted: false }).returning();
  return copy;
};
