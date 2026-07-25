import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
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

const bankProject = async (userId: string, projectId: string) => {
  const [row] = await database
    .select({ project: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(
      eq(projects.id, projectId),
      eq(clients.userId, userId),
      eq(projects.hourBankEnabled, true),
    ))
    .limit(1);

  if (!row?.project.hourBankStartDate) {
    throw new HourBankUnavailableError('Hour bank is not enabled for this project');
  }
  return row;
};

const actualByDay = async (
  userId: string,
  projectId: string,
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
      eq(projects.id, projectId),
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
  projectId: string,
  before: string,
  initialMinutes: number,
) => {
  const closures = await database
    .select({
      weekStart: hourBankClosures.weekStart,
      weekEnd: hourBankClosures.weekEnd,
    })
    .from(hourBankClosures)
    .where(and(
      eq(hourBankClosures.userId, userId),
      eq(hourBankClosures.projectId, projectId),
      lt(hourBankClosures.weekStart, before),
    ));

  // Une fermeture confirme qu'une semaine doit contribuer au solde. Ses heures
  // demeurent toutefois calculées depuis les entrées courantes afin qu'une
  // modification ultérieure ne propage jamais un ancien mouvement.
  const movements = await Promise.all(closures.map(async (closure) => {
    const actual = await actualByDay(userId, projectId, closure.weekStart, closure.weekEnd);
    return [...actual.values()].reduce(
      (sum, day) => sum + day.actualMinutes - day.clientMinutes,
      0,
    );
  }));
  return initialMinutes + movements.reduce((sum, movement) => sum + movement, 0);
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
  projectId: string,
  weekStart: string,
  useStoredValues = true,
) => {
  const bank = await bankProject(userId, projectId);
  const project = bank.project;
  const startDate = project.hourBankStartDate;
  if (!startDate) throw new HourBankUnavailableError('Hour bank start date is required');
  const weekEnd = validateWeek(weekStart);
  if (weekEnd < startDate) {
    throw new HourBankUnavailableError('Week predates hour bank activation');
  }

  const actual = await actualByDay(userId, projectId, weekStart, weekEnd);
  const [existing] = await database
    .select()
    .from(hourBankClosures)
    .where(and(
      eq(hourBankClosures.userId, userId),
      eq(hourBankClosures.projectId, projectId),
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
    projectId,
    weekStart,
    project.hourBankInitialMinutes,
  );
  const movementMinutes = days.reduce((sum, day) => sum + day.movementMinutes, 0);
  const actualMinutes = days.reduce((sum, day) => sum + day.actualMinutes, 0);
  const billedMinutes = days.reduce((sum, day) => sum + day.billedMinutes, 0);
  const isConsistent = !existing || (
    existing.actualMinutes === actualMinutes
    && existing.billedMinutes === billedMinutes
    && existing.movementMinutes === movementMinutes
  );

  return {
    project: {
      id: project.id,
      name: project.name,
      clientName: bank.clientName,
      startDate,
      initialMinutes: project.hourBankInitialMinutes,
      maxDailyBillableMinutes: project.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: project.maxWeeklyBillableMinutes,
    },
    weekStart,
    weekEnd,
    isClosed: Boolean(existing),
    isConsistent,
    closureId: existing?.id ?? null,
    note: existing?.note ?? '',
    openingBalanceMinutes,
    closingBalanceMinutes: openingBalanceMinutes + movementMinutes,
    days,
  };
};

/**
 * Resynchronise une semaine déjà fermée après une mutation d'entrée.
 * Une semaine encore ouverte ne nécessite aucune écriture supplémentaire.
 */
export const synchronizeClosedHourBankWeek = async (
  userId: string,
  projectId: string,
  workDate: string,
) => {
  const date = dateAtNoon(workDate);
  const offset = (date.getUTCDay() + 1) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  const weekStart = iso(date);
  const weekEnd = addDays(weekStart, 6);
  const [closure] = await database
    .select()
    .from(hourBankClosures)
    .where(and(
      eq(hourBankClosures.userId, userId),
      eq(hourBankClosures.projectId, projectId),
      eq(hourBankClosures.weekStart, weekStart),
    ))
    .limit(1);
  if (!closure) return false;

  const actual = await actualByDay(userId, projectId, weekStart, weekEnd);
  const values = Array.from({ length: 7 }, (_, offset) => {
    const day = addDays(weekStart, offset);
    const totals = actual.get(day);
    const actualMinutes = totals?.actualMinutes ?? 0;
    const billedMinutes = totals?.clientMinutes ?? 0;
    return {
      workDate: day,
      actualMinutes,
      billedMinutes,
      movementMinutes: actualMinutes - billedMinutes,
    };
  });
  const actualMinutes = values.reduce((sum, day) => sum + day.actualMinutes, 0);
  const billedMinutes = values.reduce((sum, day) => sum + day.billedMinutes, 0);

  await database.transaction(async (tx) => {
    await tx.update(hourBankClosures).set({
      actualMinutes,
      billedMinutes,
      movementMinutes: actualMinutes - billedMinutes,
      updatedAt: new Date(),
    }).where(eq(hourBankClosures.id, closure.id));
    await tx.delete(hourBankDays).where(eq(hourBankDays.closureId, closure.id));
    await tx.insert(hourBankDays).values(
      values.map((day) => ({ closureId: closure.id, ...day })),
    );
  });
  return true;
};

export const closeHourBankWeek = async (
  userId: string,
  projectId: string,
  weekStart: string,
  input: { note: string },
) => {
  const proposal = await getHourBankWeek(userId, projectId, weekStart, false);
  const billedMinutes = proposal.days.reduce((sum, day) => sum + day.billedMinutes, 0);
  if (billedMinutes > proposal.project.maxWeeklyBillableMinutes) {
    throw new InvalidHourBankWeekError('Weekly billable time exceeds the project limit');
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
          projectId,
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

  return getHourBankWeek(userId, projectId, weekStart);
};
