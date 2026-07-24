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
    ...timestamps,
  },
  (table) => [
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
    description: text('description').notNull(),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    isBilled: boolean('is_billed').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
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
    check('work_entries_description_not_blank', sql`length(trim(${table.description})) > 0`),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  clients: many(clients),
  workEntries: many(workEntries),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
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
