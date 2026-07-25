import { desc, eq } from 'drizzle-orm';
import { database } from '../../database';
import { userSubscriptions, users } from '../../db/schema';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export class SubscriptionUserNotFoundError extends Error {}
export class InvalidSubscriptionPeriodError extends Error {}

export const listSubscriptions = (userId: string) =>
  database.select({
    id: userSubscriptions.id,
    periodStartedOn: userSubscriptions.periodStartedOn,
    periodEndsOn: userSubscriptions.periodEndsOn,
    paymentDate: userSubscriptions.paymentDate,
    amount: userSubscriptions.amount,
    subscriptionType: userSubscriptions.subscriptionType,
    paymentStatus: userSubscriptions.paymentStatus,
    paymentProvider: userSubscriptions.paymentProvider,
    externalReference: userSubscriptions.externalReference,
    note: userSubscriptions.note,
    createdAt: userSubscriptions.createdAt,
  }).from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.periodStartedOn), desc(userSubscriptions.createdAt));

export const getSubscriptionOverview = async (userId: string) => {
  const [[user], history] = await Promise.all([
    database.select({
      accountStatus: users.accountStatus,
      subscriptionStartedOn: users.subscriptionStartedOn,
      subscriptionEndsOn: users.subscriptionEndsOn,
    }).from(users).where(eq(users.id, userId)).limit(1),
    listSubscriptions(userId),
  ]);
  if (!user) throw new SubscriptionUserNotFoundError();
  return { current: user, history };
};

export const recordSubscription = async (
  administratorId: string,
  userId: string,
  input: {
    periodStartedOn: string;
    periodEndsOn: string;
    paymentDate: string | null;
    amount: string;
    subscriptionType: 'trial' | 'free' | 'paid' | 'manual';
    paymentStatus: PaymentStatus;
    paymentProvider: string | null;
    externalReference: string | null;
    note: string;
  },
) => database.transaction(async (transaction) => {
  if (input.periodEndsOn < input.periodStartedOn) {
    throw new InvalidSubscriptionPeriodError();
  }
  const [user] = await transaction.select({ id: users.id }).from(users)
    .where(eq(users.id, userId)).limit(1);
  if (!user) throw new SubscriptionUserNotFoundError();

  const [subscription] = await transaction.insert(userSubscriptions).values({
    userId,
    createdByUserId: administratorId,
    ...input,
  }).returning();

  // Seule une période payée ouvre ou prolonge l'accès. Les tentatives,
  // remboursements et annulations restent néanmoins visibles dans l'historique.
  if (input.paymentStatus === 'paid') {
    await transaction.update(users).set({
      subscriptionStartedOn: input.periodStartedOn,
      subscriptionEndsOn: input.periodEndsOn,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }
  return subscription;
});

export const createTrialSubscription = async (userId: string) => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const iso = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const periodStartedOn = iso(start);
  const periodEndsOn = iso(end);

  const subscription = await database.transaction(async (transaction) => {
    const [created] = await transaction.insert(userSubscriptions).values({
      userId,
      periodStartedOn,
      periodEndsOn,
      paymentDate: null,
      amount: '0.00',
      subscriptionType: 'trial',
      paymentStatus: 'paid',
      paymentProvider: 'ontime',
      externalReference: null,
      note: 'Automatic seven-day trial',
      createdByUserId: null,
    }).returning();
    await transaction.update(users).set({
      subscriptionStartedOn: periodStartedOn,
      subscriptionEndsOn: periodEndsOn,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    return created;
  });
  return { subscription, periodStartedOn, periodEndsOn };
};
