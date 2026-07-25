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
    ...timestamps,
  },
  (table) => [
    // Les courriels sont uniques sans tenir compte des espaces ni de la casse.
    uniqueIndex('users_email_unique').on(sql`lower(trim(${table.email}))`),
    check('users_email_not_blank', sql`length(trim(${table.email})) > 0`),
    check('users_first_name_not_blank', sql`length(trim(${table.firstName})) > 0`),
    check('users_last_name_not_blank', sql`length(trim(${table.lastName})) > 0`),
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

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    hourBankEnabled: boolean('hour_bank_enabled').notNull().default(false),
    hourBankStartDate: date('hour_bank_start_date', { mode: 'string' }),
    hourBankInitialMinutes: integer('hour_bank_initial_minutes').notNull().default(0),
    maxDailyBillableMinutes: integer('max_daily_billable_minutes').notNull().default(480),
    maxWeeklyBillableMinutes: integer('max_weekly_billable_minutes').notNull().default(2400),
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
    check('clients_daily_billable_positive', sql`${table.maxDailyBillableMinutes} > 0`),
    check('clients_weekly_billable_positive', sql`${table.maxWeeklyBillableMinutes} > 0`),
    check(
      'clients_hour_bank_start_required',
      sql`not ${table.hourBankEnabled} or ${table.hourBankStartDate} is not null`,
    ),
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
    // Temps présenté au client. Il peut différer du temps réellement travaillé
    // lorsque la banque d'heures du client est activée.
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
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    weekEnd: date('week_end', { mode: 'string' }).notNull(),
    actualMinutes: integer('actual_minutes').notNull(),
    billedMinutes: integer('billed_minutes').notNull(),
    movementMinutes: integer('movement_minutes').notNull(),
    note: text('note').notNull().default(''),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('hour_bank_closures_client_week_unique').on(table.clientId, table.weekStart),
    index('hour_bank_closures_user_client_idx').on(table.userId, table.clientId),
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

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(users, {
    fields: [clients.userId],
    references: [users.id],
  }),
  projects: many(projects),
  hourBankClosures: many(hourBankClosures),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  workEntries: many(workEntries),
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
  client: one(clients, {
    fields: [hourBankClosures.clientId],
    references: [clients.id],
  }),
  days: many(hourBankDays),
}));

export const hourBankDaysRelations = relations(hourBankDays, ({ one }) => ({
  closure: one(hourBankClosures, {
    fields: [hourBankDays.closureId],
    references: [hourBankClosures.id],
  }),
}));
