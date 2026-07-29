import { and, count, desc, eq, gte, ilike, lte, lt } from 'drizzle-orm';
import { database } from '../../database';
import { auditEvents, technicalLogs, users } from '../../db/schema';

export type TechnicalLog = {
  timestamp: string;
  requestId: string;
  level: 'info' | 'warning' | 'error';
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: string;
  userId?: string;
  errorCode?: string;
};

const technicalLogBuffer: TechnicalLog[] = [];
const TECHNICAL_LOG_LIMIT = 500;

export const addTechnicalLog = (event: TechnicalLog) => {
  technicalLogBuffer.push(event);
  if (technicalLogBuffer.length > TECHNICAL_LOG_LIMIT) {
    technicalLogBuffer.splice(0, technicalLogBuffer.length - TECHNICAL_LOG_LIMIT);
  }
  // Les succès restent disponibles dans le journal technique, sans encombrer
  // le terminal de développement. La console conserve ce qui exige une action.
  if (event.level !== 'info') {
    console[event.level === 'error' ? 'error' : 'warn'](JSON.stringify({
      type: 'http_request',
      ...event,
    }));
  }
};

let lastTechnicalPurge = 0;
export const persistTechnicalLog = async (event: TechnicalLog) => {
  await database.insert(technicalLogs).values({
    requestId: event.requestId,
    userId: event.userId,
    level: event.level,
    method: event.method,
    path: event.path,
    status: event.status,
    durationMs: event.durationMs.toFixed(2),
    errorCode: event.errorCode,
    errorName: event.error,
    createdAt: new Date(event.timestamp),
  });
  const now = Date.now();
  if (now - lastTechnicalPurge > 24 * 60 * 60 * 1000) {
    lastTechnicalPurge = now;
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
    await database.delete(technicalLogs).where(lt(technicalLogs.createdAt, cutoff));
  }
};

export const listTechnicalLogs = (limit = 100) =>
  technicalLogBuffer.slice(-Math.min(Math.max(limit, 1), 500)).reverse();

export const queryTechnicalLogs = async (filters: {
  level?: string;
  status?: number;
  path?: string;
  requestId?: string;
  userId?: string;
  page: number;
  pageSize: number;
}) => {
  const conditions = [];
  if (filters.level) conditions.push(eq(technicalLogs.level, filters.level));
  if (filters.status) conditions.push(eq(technicalLogs.status, filters.status));
  if (filters.path) conditions.push(ilike(technicalLogs.path, `%${filters.path}%`));
  if (filters.requestId) conditions.push(eq(technicalLogs.requestId, filters.requestId));
  if (filters.userId) conditions.push(eq(technicalLogs.userId, filters.userId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [logs, [summary]] = await Promise.all([
    database.select({
      id: technicalLogs.id,
      timestamp: technicalLogs.createdAt,
      requestId: technicalLogs.requestId,
      userId: technicalLogs.userId,
      level: technicalLogs.level,
      method: technicalLogs.method,
      path: technicalLogs.path,
      status: technicalLogs.status,
      durationMs: technicalLogs.durationMs,
      errorCode: technicalLogs.errorCode,
      error: technicalLogs.errorName,
      activityId: auditEvents.id,
      activityAction: auditEvents.action,
      activityCategory: auditEvents.category,
      activityEntityType: auditEvents.entityType,
      activityEntityId: auditEvents.entityId,
      activityMetadata: auditEvents.metadata,
      activityCreatedAt: auditEvents.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      actorEmail: users.email,
    }).from(technicalLogs)
      .leftJoin(auditEvents, eq(technicalLogs.requestId, auditEvents.requestId))
      .leftJoin(users, eq(auditEvents.actorUserId, users.id))
      .where(where).orderBy(desc(technicalLogs.createdAt))
      .limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
    database.select({ total: count() }).from(technicalLogs).where(where),
  ]);
  const total = Number(summary?.total ?? 0);
  return {
    logs: logs.map((log) => ({
      timestamp: log.timestamp,
      requestId: log.requestId,
      userId: log.userId,
      level: log.level,
      method: log.method,
      path: log.path,
      status: log.status,
      durationMs: Number(log.durationMs),
      errorCode: log.errorCode,
      error: log.error,
      activity: log.activityId ? {
        id: log.activityId,
        actorFirstName: log.actorFirstName,
        actorLastName: log.actorLastName,
        actorEmail: log.actorEmail,
        action: log.activityAction,
        category: log.activityCategory,
        entityType: log.activityEntityType,
        entityId: log.activityEntityId,
        requestId: log.requestId,
        metadata: log.activityMetadata,
        createdAt: log.activityCreatedAt,
      } : null,
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
};

export const recordAuditEvent = async (input: {
  actorUserId: string;
  action: string;
  category: string;
  entityType?: string;
  entityId?: string;
  requestId: string;
  metadata?: Record<string, string | number | boolean | null>;
}) => {
  await database.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    action: input.action,
    category: input.category,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId,
    metadata: input.metadata ?? {},
  });
};

type Filters = {
  userId?: string;
  category?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export const listAuditEvents = async (filters: Filters) => {
  const conditions = [];
  if (filters.userId) conditions.push(eq(auditEvents.actorUserId, filters.userId));
  if (filters.category) conditions.push(eq(auditEvents.category, filters.category));
  if (filters.from) conditions.push(gte(auditEvents.createdAt, new Date(`${filters.from}T00:00:00`)));
  if (filters.to) conditions.push(lte(auditEvents.createdAt, new Date(`${filters.to}T23:59:59.999`)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [events, [summary]] = await Promise.all([
    database.select({
      id: auditEvents.id,
      actorUserId: auditEvents.actorUserId,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      actorEmail: users.email,
      action: auditEvents.action,
      category: auditEvents.category,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      requestId: auditEvents.requestId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    }).from(auditEvents)
      .innerJoin(users, eq(auditEvents.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    database.select({ total: count() }).from(auditEvents).where(where),
  ]);
  const total = Number(summary?.total ?? 0);
  return {
    events,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
};
