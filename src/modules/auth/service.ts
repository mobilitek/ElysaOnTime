import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { database } from '../../database';
import { passwordResetTokens, sessions, users } from '../../db/schema';
import {
  REMEMBERED_SESSION_DURATION_SECONDS,
  STANDARD_SESSION_DURATION_SECONDS,
} from './constants';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// Les jetons bruts ne sont jamais conservés en BD. Une fuite de la table des
// sessions ne suffit donc pas à usurper une session encore valide.
const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const createSessionToken = (): string => randomBytes(32).toString('base64url');
const PASSWORD_RESET_DURATION_MS = 30 * 60 * 1000;
// Calculé une seule fois, puis vérifié pour les comptes absents afin que leur
// coût temporel ressemble à celui d'un mauvais mot de passe réel.
const dummyPasswordHash = Bun.password.hash(
  randomBytes(32).toString('base64url'),
  { algorithm: 'argon2id' },
);

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  accountStatus: 'active' | 'suspended' | 'disabled';
  subscriptionStartedOn: string;
  subscriptionEndsOn: string | null;
  accessLevel: 'full' | 'subscription_expired';
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

const authenticatedUserSelection = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  isAdmin: users.isAdmin,
  accountStatus: users.accountStatus,
  subscriptionStartedOn: users.subscriptionStartedOn,
  subscriptionEndsOn: users.subscriptionEndsOn,
} as const;

const asAuthenticatedUser = (
  user: Omit<AuthenticatedUser, 'accountStatus' | 'accessLevel'> & { accountStatus: string },
): AuthenticatedUser => ({
  ...user,
  accountStatus: user.accountStatus as AuthenticatedUser['accountStatus'],
  accessLevel: user.isAdmin || !user.subscriptionEndsOn
    || user.subscriptionEndsOn >= new Date().toISOString().slice(0, 10)
    ? 'full'
    : 'subscription_expired',
});

export const hasFullAccess = (user: AuthenticatedUser): boolean =>
  user.accessLevel === 'full';

const assertUniqueEmail = async (email: string, excludedUserId?: string) => {
  // La même vérification sert à la création et à l'édition du profil.
  // L'utilisateur courant est ignoré pendant sa propre modification.
  const conditions = [sql`lower(trim(${users.email})) = ${email}`];
  if (excludedUserId) conditions.push(sql`${users.id} <> ${excludedUserId}`);
  const [existing] = await database.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  if (existing) throw new DuplicateEmailError();
};

export const createUser = async (input: CreateUserInput): Promise<AuthenticatedUser> => {
  const email = normalizeEmail(input.email);
  await assertUniqueEmail(email);

  // Argon2id est utilisé par Bun pour produire un condensat lent et salé,
  // adapté au stockage sécuritaire des mots de passe.
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
    .returning(authenticatedUserSelection);

  if (!user) {
    throw new Error('User creation failed');
  }

  return asAuthenticatedUser(user);
};

export const updateProfile = async (userId: string, input: { email: string; firstName: string; lastName: string }): Promise<AuthenticatedUser> => {
  const email = normalizeEmail(input.email); const firstName = input.firstName.trim(); const lastName = input.lastName.trim();
  await assertUniqueEmail(email, userId);
  const [user] = await database.update(users).set({ email, firstName, lastName, updatedAt: new Date() }).where(eq(users.id, userId)).returning(authenticatedUserSelection);
  if (!user) throw new UserNotFoundError();
  return asAuthenticatedUser(user);
};

export const setAdminByEmail = async (emailInput: string, isAdmin: boolean): Promise<AuthenticatedUser> => {
  const email = normalizeEmail(emailInput);
  const [user] = await database
    .update(users)
    .set({ isAdmin, updatedAt: new Date() })
    .where(sql`lower(trim(${users.email})) = ${email}`)
    .returning(authenticatedUserSelection);
  if (!user) throw new UserNotFoundError();
  return asAuthenticatedUser(user);
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
  const [user] = await database.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UserNotFoundError();
  if (!(await Bun.password.verify(currentPassword, user.passwordHash))) throw new InvalidCurrentPasswordError();
  const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id' });
  await database.transaction(async (transaction) => {
    await transaction.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    // Une session volée ne doit pas survivre à un changement volontaire de mot de passe.
    await transaction.delete(sessions).where(eq(sessions.userId, userId));
  });
};

export const createPasswordReset = async (
  emailInput: string,
): Promise<{ email: string; firstName: string; token: string } | null> => {
  const email = normalizeEmail(emailInput);
  const [user] = await database
    .select({ id: users.id, email: users.email, firstName: users.firstName })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${email}`)
    .limit(1);

  // Retourner null sans distinction permet à la route de répondre de la même
  // façon, que le compte existe ou non, et évite l'énumération des utilisateurs.
  if (!user) return null;

  const token = createSessionToken();
  await database.transaction(async (transaction) => {
    // Un seul lien de réinitialisation peut être valide à la fois par compte.
    await transaction.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    await transaction.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_DURATION_MS),
    });
  });

  return { email: user.email, firstName: user.firstName, token };
};

export const resetPassword = async (token: string, newPassword: string): Promise<boolean> => {
  const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id' });

  return database.transaction(async (transaction) => {
    // Supprimer et retourner le jeton en une seule opération le rend à usage
    // unique, même si deux requêtes arrivent simultanément.
    const [reset] = await transaction
      .delete(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, hashSessionToken(token)),
        gt(passwordResetTokens.expiresAt, new Date()),
      ))
      .returning({ userId: passwordResetTokens.userId });

    if (!reset) return false;

    await transaction
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, reset.userId));
    // Toute session existante est invalidée après un changement de mot de passe.
    await transaction.delete(sessions).where(eq(sessions.userId, reset.userId));
    await transaction.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, reset.userId));
    return true;
  });
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
      isAdmin: users.isAdmin,
      accountStatus: users.accountStatus,
      subscriptionStartedOn: users.subscriptionStartedOn,
      subscriptionEndsOn: users.subscriptionEndsOn,
      accessAllowed: sql<boolean>`${users.accountStatus} = 'active'`,
    })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${email}`)
    .limit(1);

  const passwordMatches = await Bun.password.verify(
    password,
    user?.passwordHash ?? await dummyPasswordHash,
  );

  // Une réponse et un coût cryptographique comparables réduisent l'énumération
  // des comptes par contenu ou par mesure de latence.
  if (!user || !user.accessAllowed || !passwordMatches) {
    return null;
  }

  const durationSeconds = rememberMe
    ? REMEMBERED_SESSION_DURATION_SECONDS
    : STANDARD_SESSION_DURATION_SECONDS;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000);
  const token = createSessionToken();

  // Seul le condensat est persisté; le jeton brut est remis au navigateur
  // une seule fois et sera transporté dans un témoin HTTP-only.
  await database.insert(sessions).values({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return {
    token,
    expiresAt,
    user: asAuthenticatedUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: user.isAdmin,
      accountStatus: user.accountStatus,
      subscriptionStartedOn: user.subscriptionStartedOn,
      subscriptionEndsOn: user.subscriptionEndsOn,
    }),
  };
};

export const getUserBySessionToken = async (
  token: string | undefined,
): Promise<AuthenticatedUser | null> => {
  if (!token) {
    return null;
  }

  // Une session expirée est considérée absente, même si sa ligne n'a pas encore
  // été purgée physiquement de la base de données.
  const [result] = await database
    .select(authenticatedUserSelection)
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.accountStatus, 'active'),
      ),
    )
    .limit(1);

  return result ? asAuthenticatedUser(result) : null;
};

export const deleteSession = async (token: string | undefined): Promise<void> => {
  if (!token) {
    return;
  }

  await database.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
};
