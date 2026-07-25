import { and, asc, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { database } from '../../database';
import { sessions, users } from '../../db/schema';
import { createUser, DuplicateEmailError } from '../auth/service';

export type AccountStatus = 'active' | 'suspended' | 'disabled';

export class ManagedUserNotFoundError extends Error {}
export class InvalidSubscriptionError extends Error {}
export class ProtectedAdministratorError extends Error {}

type UserUpdate = {
  firstName?: string;
  lastName?: string;
  email?: string;
  isAdmin?: boolean;
  accountStatus?: AccountStatus;
  subscriptionStartedOn?: string;
  subscriptionEndsOn?: string | null;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const listManagedUsers = async (
  search: string,
  page: number,
  pageSize: number,
) => {
  const term = search.trim();
  const where = term
    ? or(
      ilike(users.email, `%${term}%`),
      ilike(users.firstName, `%${term}%`),
      ilike(users.lastName, `%${term}%`),
    )
    : undefined;
  const [rows, [summary]] = await Promise.all([
    database.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isAdmin: users.isAdmin,
      accountStatus: users.accountStatus,
      subscriptionStartedOn: users.subscriptionStartedOn,
      subscriptionEndsOn: users.subscriptionEndsOn,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      // Les sous-requêtes sont corrélées explicitement à users.id. Les noms
      // qualifiés évitent toute ambiguïté entre les nombreuses colonnes id.
      lastLoginAt: sql<Date | null>`(
        select max(s.created_at) from sessions s
        where s.user_id = "users"."id"
      )`,
      clientCount: sql<number>`(
        select count(*)::int from clients c
        where c.user_id = "users"."id"
      )`,
      projectCount: sql<number>`(
        select count(*)::int from projects p
        inner join clients c on c.id = p.client_id
        where c.user_id = "users"."id"
      )`,
      entryCount: sql<number>`(
        select count(*)::int from work_entries w
        where w.user_id = "users"."id"
      )`,
    }).from(users)
      .where(where)
      .orderBy(desc(users.createdAt), asc(users.email))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database.select({ total: count() }).from(users).where(where),
  ]);
  const total = Number(summary?.total ?? 0);
  return {
    users: rows,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
};

export const createManagedUser = async (input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  isAdmin: boolean;
  accountStatus: AccountStatus;
  subscriptionStartedOn: string;
  subscriptionEndsOn: string | null;
}) => {
  if (input.subscriptionEndsOn && input.subscriptionEndsOn < input.subscriptionStartedOn) {
    throw new InvalidSubscriptionError('Subscription end must follow its start');
  }
  const user = await createUser(input);
  const [updated] = await database.update(users).set({
    isAdmin: input.isAdmin,
    accountStatus: input.accountStatus,
    subscriptionStartedOn: input.subscriptionStartedOn,
    subscriptionEndsOn: input.subscriptionEndsOn,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id)).returning();
  return updated;
};

export const updateManagedUser = async (
  administratorId: string,
  userId: string,
  input: UserUpdate,
) => database.transaction(async (transaction) => {
  const [current] = await transaction.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!current) throw new ManagedUserNotFoundError('User not found');

  const nextStatus = input.accountStatus ?? current.accountStatus as AccountStatus;
  const nextIsAdmin = input.isAdmin ?? current.isAdmin;
  const nextStart = input.subscriptionStartedOn ?? current.subscriptionStartedOn;
  const nextEnd = input.subscriptionEndsOn === undefined
    ? current.subscriptionEndsOn
    : input.subscriptionEndsOn;

  // Un administrateur ne peut pas retirer lui-même son propre accès à l'écran
  // qui permettrait de corriger la situation.
  if (userId === administratorId && (!nextIsAdmin || nextStatus !== 'active')) {
    throw new ProtectedAdministratorError('An administrator cannot lock their own account');
  }
  if (nextEnd && nextEnd < nextStart) {
    throw new InvalidSubscriptionError('Subscription end must follow its start');
  }
  if (current.isAdmin && !nextIsAdmin) {
    const [otherAdmins] = await transaction.select({ total: count() }).from(users)
      .where(and(eq(users.isAdmin, true), ne(users.id, userId)));
    if (Number(otherAdmins?.total ?? 0) === 0) {
      throw new ProtectedAdministratorError('The last administrator cannot be removed');
    }
  }
  if (input.email) {
    const email = normalizeEmail(input.email);
    const [duplicate] = await transaction.select({ id: users.id }).from(users)
      .where(and(
        sql`lower(trim(${users.email})) = ${email}`,
        ne(users.id, userId),
      )).limit(1);
    if (duplicate) throw new DuplicateEmailError();
  }

  const [updated] = await transaction.update(users).set({
    ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
    ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
    ...(input.isAdmin !== undefined ? { isAdmin: input.isAdmin } : {}),
    ...(input.accountStatus !== undefined ? { accountStatus: input.accountStatus } : {}),
    ...(input.subscriptionStartedOn !== undefined
      ? { subscriptionStartedOn: input.subscriptionStartedOn }
      : {}),
    ...(input.subscriptionEndsOn !== undefined
      ? { subscriptionEndsOn: input.subscriptionEndsOn }
      : {}),
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();

  if (nextStatus !== 'active') {
    await transaction.delete(sessions).where(eq(sessions.userId, userId));
  }
  return updated;
});
