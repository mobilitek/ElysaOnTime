import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Colonnes d'audit communes aux entités modifiables. */
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    accountStatus: varchar('account_status', { length: 20 }).notNull().default('active'),
    subscriptionStartedOn: date('subscription_started_on', { mode: 'string' })
      .notNull()
      .default(sql`current_date`),
    subscriptionEndsOn: date('subscription_ends_on', { mode: 'string' }),
    ...timestamps,
  },
  (table) => [
    // Les courriels sont uniques sans tenir compte des espaces ni de la casse.
    uniqueIndex('users_email_unique').on(sql`lower(trim(${table.email}))`),
    check('users_email_not_blank', sql`length(trim(${table.email})) > 0`),
    check('users_first_name_not_blank', sql`length(trim(${table.firstName})) > 0`),
    check('users_last_name_not_blank', sql`length(trim(${table.lastName})) > 0`),
    index('users_account_status_idx').on(table.accountStatus),
    index('users_subscription_ends_idx').on(table.subscriptionEndsOn),
    check(
      'users_account_status_valid',
      sql`${table.accountStatus} in ('active', 'suspended', 'disabled')`,
    ),
    check(
      'users_subscription_dates_valid',
      sql`${table.subscriptionEndsOn} is null or ${table.subscriptionEndsOn} >= ${table.subscriptionStartedOn}`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
    check('sessions_token_hash_not_blank', sql`length(trim(${table.tokenHash})) > 0`),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('password_reset_tokens_user_id_idx').on(table.userId),
    index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
    check('password_reset_tokens_hash_not_blank', sql`length(trim(${table.tokenHash})) > 0`),
  ],
);

export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    periodStartedOn: date('period_started_on', { mode: 'string' }).notNull(),
    periodEndsOn: date('period_ends_on', { mode: 'string' }).notNull(),
    paymentDate: date('payment_date', { mode: 'string' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    subscriptionType: varchar('subscription_type', { length: 20 }).notNull().default('manual'),
    paymentStatus: varchar('payment_status', { length: 20 }).notNull().default('paid'),
    paymentProvider: varchar('payment_provider', { length: 50 }),
    externalReference: varchar('external_reference', { length: 200 }),
    note: text('note').notNull().default(''),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('user_subscriptions_user_period_idx').on(table.userId, table.periodStartedOn),
    index('user_subscriptions_payment_date_idx').on(table.paymentDate),
    check('user_subscriptions_period_valid', sql`${table.periodEndsOn} >= ${table.periodStartedOn}`),
    check('user_subscriptions_amount_non_negative', sql`${table.amount} >= 0`),
    check(
      'user_subscriptions_type_valid',
      sql`${table.subscriptionType} in ('trial', 'free', 'paid', 'manual')`,
    ),
    check(
      'user_subscriptions_payment_status_valid',
      sql`${table.paymentStatus} in ('pending', 'paid', 'failed', 'refunded', 'cancelled')`,
    ),
  ],
);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // Un utilisateur ne peut pas posséder deux clients dont les noms ne
    // diffèrent que par la casse ou par des espaces superflus.
    uniqueIndex('clients_user_name_unique').on(
      table.userId,
      sql`lower(trim(${table.name}))`,
    ),
    index('clients_user_active_idx').on(table.userId, table.isActive),
    check('clients_name_not_blank', sql`length(trim(${table.name})) > 0`),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    hourBankEnabled: boolean('hour_bank_enabled').notNull().default(false),
    hourBankStartDate: date('hour_bank_start_date', { mode: 'string' }),
    hourBankInitialMinutes: integer('hour_bank_initial_minutes').notNull().default(0),
    maxDailyBillableMinutes: integer('max_daily_billable_minutes').notNull().default(480),
    maxWeeklyBillableMinutes: integer('max_weekly_billable_minutes').notNull().default(2400),
    ...timestamps,
  },
  (table) => [
    // L'unicité d'un projet est limitée à son client; deux clients distincts
    // peuvent donc avoir des projets portant le même nom.
    uniqueIndex('projects_client_name_unique').on(
      table.clientId,
      sql`lower(trim(${table.name}))`,
    ),
    index('projects_client_active_idx').on(table.clientId, table.isActive),
    check('projects_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('projects_hourly_rate_non_negative', sql`${table.hourlyRate} >= 0`),
    check('projects_daily_billable_positive', sql`${table.maxDailyBillableMinutes} > 0`),
    check('projects_weekly_billable_positive', sql`${table.maxWeeklyBillableMinutes} > 0`),
    check(
      'projects_hour_bank_start_required',
      sql`not ${table.hourBankEnabled} or ${table.hourBankStartDate} is not null`,
    ),
  ],
);

export const workEntries = pgTable(
  'work_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    // Temps facturable du projet. Il peut différer du temps réellement travaillé
    // lorsque la banque d'heures du projet est activée.
    clientMinutes: integer('client_minutes').notNull().default(0),
    description: text('description').notNull(),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    // Le taux et le montant sont historisés sur l'entrée. Une modification
    // future du projet ne doit pas réécrire une entrée déjà facturée.
    isBilled: boolean('is_billed').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    // La suppression est logique : les données restent récupérables et peuvent
    // être réaffichées avec le filtre « Afficher les entrées supprimées ».
    ...timestamps,
  },
  (table) => [
    index('work_entries_user_date_idx').on(table.userId, table.workDate),
    index('work_entries_project_date_idx').on(table.projectId, table.workDate),
    index('work_entries_user_deleted_date_idx').on(
      table.userId,
      table.isDeleted,
      table.workDate,
    ),
    check(
      'work_entries_duration_valid',
      sql`${table.durationMinutes} >= 0`,
    ),
    check('work_entries_client_minutes_valid', sql`${table.clientMinutes} >= 0`),
    check('work_entries_description_not_blank', sql`length(trim(${table.description})) > 0`),
  ],
);

export const hourBankClosures = pgTable(
  'hour_bank_closures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    weekEnd: date('week_end', { mode: 'string' }).notNull(),
    actualMinutes: integer('actual_minutes').notNull(),
    billedMinutes: integer('billed_minutes').notNull(),
    movementMinutes: integer('movement_minutes').notNull(),
    note: text('note').notNull().default(''),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('hour_bank_closures_project_week_unique').on(table.projectId, table.weekStart),
    index('hour_bank_closures_user_project_idx').on(table.userId, table.projectId),
    check('hour_bank_closures_actual_non_negative', sql`${table.actualMinutes} >= 0`),
    check('hour_bank_closures_billed_non_negative', sql`${table.billedMinutes} >= 0`),
    check(
      'hour_bank_closures_movement_consistent',
      sql`${table.movementMinutes} = ${table.actualMinutes} - ${table.billedMinutes}`,
    ),
  ],
);

export const hourBankDays = pgTable(
  'hour_bank_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    closureId: uuid('closure_id')
      .notNull()
      .references(() => hourBankClosures.id, { onDelete: 'cascade' }),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    actualMinutes: integer('actual_minutes').notNull(),
    billedMinutes: integer('billed_minutes').notNull(),
    movementMinutes: integer('movement_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hour_bank_days_closure_date_unique').on(table.closureId, table.workDate),
    index('hour_bank_days_date_idx').on(table.workDate),
    check('hour_bank_days_actual_non_negative', sql`${table.actualMinutes} >= 0`),
    check('hour_bank_days_billed_non_negative', sql`${table.billedMinutes} >= 0`),
    check(
      'hour_bank_days_movement_consistent',
      sql`${table.movementMinutes} = ${table.actualMinutes} - ${table.billedMinutes}`,
    ),
  ],
);

// Ces relations décrivent la navigation Drizzle; les clés étrangères ci-dessus
// demeurent la source réelle d'intégrité dans PostgreSQL.
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
  clients: many(clients),
  workEntries: many(workEntries),
  hourBankClosures: many(hourBankClosures),
  subscriptions: many(userSubscriptions, { relationName: 'subscriptionOwner' }),
  subscriptionsCreated: many(userSubscriptions, { relationName: 'subscriptionCreator' }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id],
    relationName: 'subscriptionOwner',
  }),
  createdBy: one(users, {
    fields: [userSubscriptions.createdByUserId],
    references: [users.id],
    relationName: 'subscriptionCreator',
  }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(users, {
    fields: [clients.userId],
    references: [users.id],
  }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  workEntries: many(workEntries),
  hourBankClosures: many(hourBankClosures),
}));

export const workEntriesRelations = relations(workEntries, ({ one }) => ({
  user: one(users, {
    fields: [workEntries.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [workEntries.projectId],
    references: [projects.id],
  }),
}));

export const hourBankClosuresRelations = relations(hourBankClosures, ({ one, many }) => ({
  user: one(users, {
    fields: [hourBankClosures.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [hourBankClosures.projectId],
    references: [projects.id],
  }),
  days: many(hourBankDays),
}));

export const hourBankDaysRelations = relations(hourBankDays, ({ one }) => ({
  closure: one(hourBankClosures, {
    fields: [hourBankDays.closureId],
    references: [hourBankClosures.id],
  }),
}));
