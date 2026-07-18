import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { database } from '../../database';
import { sessions, users } from '../../db/schema';
import {
  REMEMBERED_SESSION_DURATION_SECONDS,
  STANDARD_SESSION_DURATION_SECONDS,
} from './constants';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const createSessionToken = (): string => randomBytes(32).toString('base64url');

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type CreatedSession = {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
};

export type CreateUserInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account already exists for this email address');
    this.name = 'DuplicateEmailError';
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() { super('Current password is invalid'); this.name = 'InvalidCurrentPasswordError'; }
}

export class UserNotFoundError extends Error {
  constructor() { super('User not found'); this.name = 'UserNotFoundError'; }
}

const assertUniqueEmail = async (email: string, excludedUserId?: string) => {
  const conditions = [sql`lower(trim(${users.email})) = ${email}`];
  if (excludedUserId) conditions.push(sql`${users.id} <> ${excludedUserId}`);
  const [existing] = await database.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  if (existing) throw new DuplicateEmailError();
};

export const createUser = async (input: CreateUserInput): Promise<AuthenticatedUser> => {
  const email = normalizeEmail(input.email);
  await assertUniqueEmail(email);

  const passwordHash = await Bun.password.hash(input.password, {
    algorithm: 'argon2id',
  });

  const [user] = await database
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    })
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    });

  if (!user) {
    throw new Error('User creation failed');
  }

  return user;
};

export const updateProfile = async (userId: string, input: { email: string; firstName: string; lastName: string }): Promise<AuthenticatedUser> => {
  const email = normalizeEmail(input.email); const firstName = input.firstName.trim(); const lastName = input.lastName.trim();
  await assertUniqueEmail(email, userId);
  const [user] = await database.update(users).set({ email, firstName, lastName, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });
  if (!user) throw new UserNotFoundError();
  return user;
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
  const [user] = await database.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UserNotFoundError();
  if (!(await Bun.password.verify(currentPassword, user.passwordHash))) throw new InvalidCurrentPasswordError();
  const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id' });
  await database.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
};

export const authenticate = async (
  emailInput: string,
  password: string,
  rememberMe: boolean,
): Promise<CreatedSession | null> => {
  const email = normalizeEmail(emailInput);
  const [user] = await database
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${email}`)
    .limit(1);

  if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
    return null;
  }

  const durationSeconds = rememberMe
    ? REMEMBERED_SESSION_DURATION_SECONDS
    : STANDARD_SESSION_DURATION_SECONDS;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000);
  const token = createSessionToken();

  await database.insert(sessions).values({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  };
};

export const getUserBySessionToken = async (
  token: string | undefined,
): Promise<AuthenticatedUser | null> => {
  if (!token) {
    return null;
  }

  const [result] = await database
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return result ?? null;
};

export const deleteSession = async (token: string | undefined): Promise<void> => {
  if (!token) {
    return;
  }

  await database.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
};
