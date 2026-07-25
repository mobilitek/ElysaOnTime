import { and, asc, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';
import { database } from '../../database';
import {
  clients,
  hourBankClosures,
  hourBankDays,
  projects,
  workEntries,
} from '../../db/schema';

export class HourBankUnavailableError extends Error {}
export class InvalidHourBankWeekError extends Error {}

const dateAtNoon = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = dateAtNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};

const bankClient = async (userId: string, clientId: string) => {
  const [client] = await database
    .select()
    .from(clients)
    .where(and(
      eq(clients.id, clientId),
      eq(clients.userId, userId),
      eq(clients.hourBankEnabled, true),
    ))
    .limit(1);

  if (!client?.hourBankStartDate) {
    throw new HourBankUnavailableError('Hour bank is not enabled for this client');
  }
  return client;
};

const actualByDay = async (
  userId: string,
  clientId: string,
  from: string,
  to: string,
) => {
  const rows = await database
    .select({
      workDate: workEntries.workDate,
      actualMinutes: sql<number>`coalesce(sum(${workEntries.durationMinutes}), 0)::int`,
      clientMinutes: sql<number>`coalesce(sum(${workEntries.clientMinutes}), 0)::int`,
    })
    .from(workEntries)
    .innerJoin(projects, eq(workEntries.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(
      eq(workEntries.userId, userId),
      eq(clients.id, clientId),
      eq(workEntries.isDeleted, false),
      gte(workEntries.workDate, from),
      lte(workEntries.workDate, to),
    ))
    .groupBy(workEntries.workDate);

  return new Map(rows.map((row) => [row.workDate, {
    actualMinutes: Number(row.actualMinutes),
    clientMinutes: Number(row.clientMinutes),
  }]));
};

const balanceBefore = async (
  userId: string,
  clientId: string,
  before: string,
  initialMinutes: number,
  excludedClosureId?: string,
) => {
  const conditions = [
    eq(hourBankClosures.userId, userId),
    eq(hourBankClosures.clientId, clientId),
    lt(hourBankClosures.weekStart, before),
  ];
  if (excludedClosureId) conditions.push(ne(hourBankClosures.id, excludedClosureId));
  const [row] = await database
    .select({
      movements: sql<number>`coalesce(sum(${hourBankClosures.movementMinutes}), 0)::int`,
    })
    .from(hourBankClosures)
    .where(and(...conditions));
  return initialMinutes + Number(row?.movements ?? 0);
};

const validateWeek = (weekStart: string) => {
  const date = dateAtNoon(weekStart);
  if (Number.isNaN(date.getTime()) || date.getUTCDay() !== 6) {
    throw new InvalidHourBankWeekError('Week must start on Saturday');
  }
  return addDays(weekStart, 6);
};

export const getHourBankWeek = async (
  userId: string,
  clientId: string,
  weekStart: string,
  useStoredValues = true,
) => {
  const client = await bankClient(userId, clientId);
  const startDate = client.hourBankStartDate;
  if (!startDate) throw new HourBankUnavailableError('Hour bank start date is required');
  const weekEnd = validateWeek(weekStart);
  if (weekEnd < startDate) {
    throw new HourBankUnavailableError('Week predates hour bank activation');
  }

  const actual = await actualByDay(userId, clientId, weekStart, weekEnd);
  const [existing] = await database
    .select()
    .from(hourBankClosures)
    .where(and(
      eq(hourBankClosures.userId, userId),
      eq(hourBankClosures.clientId, clientId),
      eq(hourBankClosures.weekStart, weekStart),
    ))
    .limit(1);
  const storedDays = existing
    ? await database
      .select()
      .from(hourBankDays)
      .where(eq(hourBankDays.closureId, existing.id))
      .orderBy(asc(hourBankDays.workDate))
    : [];
  const storedByDate = new Map(storedDays.map((day) => [day.workDate, day]));

  const days = Array.from({ length: 7 }, (_, offset) => {
    const workDate = addDays(weekStart, offset);
    const entryTotals = actual.get(workDate);
    const actualMinutes = entryTotals?.actualMinutes ?? 0;
    const stored = storedByDate.get(workDate);
    const entryClientMinutes = workDate < startDate
      ? actualMinutes
      : entryTotals?.clientMinutes ?? 0;
    const proposedBilledMinutes = (useStoredValues ? stored?.billedMinutes : undefined)
      ?? entryClientMinutes;
    return {
      workDate,
      actualMinutes,
      billedMinutes: proposedBilledMinutes,
      movementMinutes: actualMinutes - proposedBilledMinutes,
    };
  });
  const openingBalanceMinutes = await balanceBefore(
    userId,
    clientId,
    weekStart,
    client.hourBankInitialMinutes,
    existing?.id,
  );
  const movementMinutes = days.reduce((sum, day) => sum + day.movementMinutes, 0);

  return {
    client: {
      id: client.id,
      name: client.name,
      startDate,
      initialMinutes: client.hourBankInitialMinutes,
      maxDailyBillableMinutes: client.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: client.maxWeeklyBillableMinutes,
    },
    weekStart,
    weekEnd,
    isClosed: Boolean(existing),
    closureId: existing?.id ?? null,
    note: existing?.note ?? '',
    openingBalanceMinutes,
    closingBalanceMinutes: openingBalanceMinutes + movementMinutes,
    days,
  };
};

export const closeHourBankWeek = async (
  userId: string,
  clientId: string,
  weekStart: string,
  input: { note: string },
) => {
  const proposal = await getHourBankWeek(userId, clientId, weekStart, false);
  const billedMinutes = proposal.days.reduce((sum, day) => sum + day.billedMinutes, 0);
  if (billedMinutes > proposal.client.maxWeeklyBillableMinutes) {
    throw new InvalidHourBankWeekError('Weekly billed time exceeds the client limit');
  }
  const values = proposal.days.map((day) => ({
    workDate: day.workDate,
    actualMinutes: day.actualMinutes,
    billedMinutes: day.billedMinutes,
    movementMinutes: day.actualMinutes - day.billedMinutes,
  }));
  const actualMinutes = values.reduce((sum, day) => sum + day.actualMinutes, 0);
  const movementMinutes = actualMinutes - billedMinutes;

  await database.transaction(async (tx) => {
    const [closure] = proposal.closureId
      ? await tx
        .update(hourBankClosures)
        .set({
          actualMinutes,
          billedMinutes,
          movementMinutes,
          note: input.note.trim(),
          updatedAt: new Date(),
        })
        .where(eq(hourBankClosures.id, proposal.closureId))
        .returning()
      : await tx
        .insert(hourBankClosures)
        .values({
          userId,
          clientId,
          weekStart,
          weekEnd: proposal.weekEnd,
          actualMinutes,
          billedMinutes,
          movementMinutes,
          note: input.note.trim(),
        })
        .returning();
    if (!closure) throw new Error('Hour bank closure could not be saved');
    await tx.delete(hourBankDays).where(eq(hourBankDays.closureId, closure.id));
    await tx.insert(hourBankDays).values(
      values.map((day) => ({ closureId: closure.id, ...day })),
    );
  });

  return getHourBankWeek(userId, clientId, weekStart);
};
