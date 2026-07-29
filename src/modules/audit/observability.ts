import { Elysia, ElysiaCustomStatusResponse } from 'elysia';
import { and, eq, inArray } from 'drizzle-orm';
import { database } from '../../database';
import { clients, projects, users, workEntries } from '../../db/schema';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import { addTechnicalLog, persistTechnicalLog, recordAuditEvent } from './service';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const sensitiveKeys = new Set([
  'password', 'currentPassword', 'newPassword', 'confirmation', 'description',
  'descriptionDocument', 'token', 'cookie', 'note',
]);
type Snapshot = Record<string, string | number | boolean | null>;

const safeMetadata = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return Object.fromEntries(Object.entries(body as Record<string, unknown>)
    .filter(([key, value]) =>
      !sensitiveKeys.has(key)
      && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 20)) as Record<string, string | number | boolean>;
};

const classify = (method: string, path: string) => {
  const category =
    path.includes('/work-entries') ? 'journal'
      : path.includes('/clients') ? 'client'
        : path.includes('/projects') ? 'project'
          : path.includes('/backup') || path.includes('/data-import') ? 'data'
            : path.includes('/auth') ? 'account'
              : path.includes('/subscriptions') || path.includes('/admin') ? 'administration'
                : 'system';
  const suffix =
    path.endsWith('/login') ? 'logged_in'
      : path.endsWith('/logout') ? 'logged_out'
        : path.endsWith('/change-password') ? 'password_changed'
          : path.endsWith('/register') ? 'registered'
            : path.endsWith('/download') ? 'backup_downloaded'
              : path.endsWith('/analyze') ? 'backup_analyzed'
                : path.includes('toggle-billed') ? 'billing_changed'
      : path.includes('toggle-deleted') ? 'deletion_changed'
        : path.includes('duplicate') ? 'duplicated'
          : path.includes('restore') ? 'restored'
            : path.includes('export') ? 'exported'
              : method === 'POST' ? 'created'
                : method === 'PATCH' || method === 'PUT' ? 'updated'
                  : method === 'DELETE' ? 'deleted'
                    : 'changed';
  return { category, action: `${category}.${suffix}` };
};

const statusNumber = (value: number | string | undefined) => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 200;
};
const responsePayload = (value: unknown): unknown =>
  value instanceof ElysiaCustomStatusResponse ? value.response : value;
const errorCodeFor = (value: unknown) => {
  const payload = responsePayload(value);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const code = (payload as { error?: unknown }).error;
  return typeof code === 'string' ? code.slice(0, 100) : undefined;
};
const entityIdFor = (value: unknown) => {
  const payload = responsePayload(value);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  for (const key of ['entry', 'client', 'project', 'user', 'subscription']) {
    const entity = (payload as Record<string, unknown>)[key];
    if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
      const id = (entity as { id?: unknown }).id;
      if (typeof id === 'string') return id;
    }
  }
  return undefined;
};
const resultMetadata = (value: unknown): Snapshot => {
  const payload = responsePayload(value);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const result = (payload as Record<string, unknown>).summary
    ?? (payload as Record<string, unknown>).analysis;
  return safeMetadata(result);
};

const entrySnapshot = async (userId: string, id: string): Promise<Snapshot | null> => {
  const [row] = await database.select({
    client: clients.name,
    project: projects.name,
    workDate: workEntries.workDate,
    workedMinutes: workEntries.durationMinutes,
    billableMinutes: workEntries.clientMinutes,
    hourlyRate: workEntries.hourlyRate,
    amount: workEntries.amount,
    billed: workEntries.isBilled,
    deleted: workEntries.isDeleted,
    description: workEntries.description,
  }).from(workEntries)
    .innerJoin(projects, eq(workEntries.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(workEntries.id, id), eq(workEntries.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    contentLines: row.description.split(/\r?\n/).length,
  };
};

const snapshotFor = async (
  userId: string,
  path: string,
  params: Record<string, string | undefined> | undefined,
  body: unknown,
): Promise<Snapshot | null> => {
  if (path.endsWith('/toggle-billed') || path.endsWith('/toggle-deleted')) {
    const ids = body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
      ? (body as { ids: string[] }).ids.slice(0, 20)
      : [];
    if (!ids.length) return null;
    const rows = await database.select({
      id: workEntries.id,
      workDate: workEntries.workDate,
      billed: workEntries.isBilled,
      deleted: workEntries.isDeleted,
    }).from(workEntries)
      .where(and(eq(workEntries.userId, userId), inArray(workEntries.id, ids)));
    return {
      affectedEntries: rows.length,
      states: rows.map((row) =>
        `${row.workDate}:${row.billed ? 'billed' : 'unbilled'}:${row.deleted ? 'deleted' : 'active'}`)
        .sort().join(', '),
    };
  }
  const id = params?.id
    ?? path.match(/^\/api\/(?:work-entries|clients|projects)\/([0-9a-f]{8}-[0-9a-f-]{27})/)?.[1];
  if (path.startsWith('/api/work-entries') && id) return entrySnapshot(userId, id);
  if (path.startsWith('/api/clients') && id) {
    const [row] = await database.select({
      name: clients.name,
      active: clients.isActive,
    }).from(clients).where(and(eq(clients.id, id), eq(clients.userId, userId))).limit(1);
    return row ?? null;
  }
  if (path.startsWith('/api/projects') && id) {
    const [row] = await database.select({
      client: clients.name,
      name: projects.name,
      hourlyRate: projects.hourlyRate,
      active: projects.isActive,
      hourBankEnabled: projects.hourBankEnabled,
      hourBankStartDate: projects.hourBankStartDate,
      hourBankInitialMinutes: projects.hourBankInitialMinutes,
      maxDailyBillableMinutes: projects.maxDailyBillableMinutes,
      maxWeeklyBillableMinutes: projects.maxWeeklyBillableMinutes,
    }).from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(and(eq(projects.id, id), eq(clients.userId, userId))).limit(1);
    return row ?? null;
  }
  if (path === '/api/auth/profile') {
    const [row] = await database.select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    }).from(users).where(eq(users.id, userId)).limit(1);
    return row ?? null;
  }
  return null;
};

const changedMetadata = (
  before: Snapshot | null,
  after: Snapshot | null,
  body: unknown,
): Snapshot => {
  if (!before || !after) return { ...safeMetadata(body), ...(after ?? {}) };
  const changes: Snapshot = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] === after[key]) continue;
    if (key === 'description') {
      changes.contentChanged = true;
      continue;
    }
    changes[`before_${key}`] = before[key] ?? null;
    changes[`after_${key}`] = after[key] ?? null;
  }
  return changes;
};
const contextMetadata = (snapshot: Snapshot | null): Snapshot => {
  if (!snapshot) return {};
  return Object.fromEntries(
    ['workDate', 'client', 'project', 'name', 'email']
      .filter((key) => snapshot[key] !== undefined)
      .map((key) => [key, snapshot[key]]),
  );
};

export const observability = new Elysia({ name: 'observability' })
  .derive({ as: 'global' }, async ({ cookie, path, params, body }) => {
    const requestActor = await getUserBySessionToken(
      getSessionToken(cookie[SESSION_COOKIE_NAME].value),
    );
    return {
      requestId: crypto.randomUUID(),
      requestStartedAt: performance.now(),
      requestActor,
      requestAuditBefore: requestActor
        ? await snapshotFor(requestActor.id, path, params, body)
        : null,
    };
  })
  .onAfterHandle({ as: 'global' }, async (
    { request, path, body, params, set, requestId, requestStartedAt, requestActor, requestAuditBefore, responseValue },
  ) => {
    set.headers['x-request-id'] = requestId;
    const status = responseValue instanceof ElysiaCustomStatusResponse
      ? statusNumber(responseValue.code)
      : responseValue instanceof Response
        ? responseValue.status
        : statusNumber(set.status);
    const method = request.method.toUpperCase();
    const responseEntityId = entityIdFor(responseValue);
    const technicalEvent = {
      timestamp: new Date().toISOString(),
      requestId,
      level: status >= 500 ? 'error' as const : status >= 400 ? 'warning' as const : 'info' as const,
      method,
      path,
      status,
      durationMs: Math.round((performance.now() - requestStartedAt) * 100) / 100,
      userId: requestActor?.id
        ?? ((path.endsWith('/login') || path.endsWith('/register')) ? responseEntityId : undefined),
      errorCode: errorCodeFor(responseValue),
    };
    addTechnicalLog(technicalEvent);
    if (path.startsWith('/api/') || path === '/health') void persistTechnicalLog(technicalEvent).catch((error) => {
      console.error(JSON.stringify({
        type: 'technical_log_write_failure',
        requestId,
        error: error instanceof Error ? error.name : 'UnknownError',
      }));
    });
    const auditableRead = method === 'GET'
      && (path.endsWith('/export') || path.endsWith('/download'));
    const auditActorUserId = requestActor?.id
      ?? ((path.endsWith('/login') || path.endsWith('/register')) ? responseEntityId : undefined);
    if (
      auditActorUserId
      && (mutationMethods.has(method) || auditableRead)
      && path.startsWith('/api/')
      && status < 400
    ) {
      const classification = classify(method, path);
      try {
        const auditInput = auditableRead
          ? Object.fromEntries(new URL(request.url).searchParams)
          : body;
        const requestAuditAfter = await snapshotFor(
          auditActorUserId,
          path,
          responseEntityId ? { ...params, id: responseEntityId } : params,
          body,
        );
        await recordAuditEvent({
          actorUserId: auditActorUserId,
          ...classification,
          entityType: classification.category,
          entityId: responseEntityId ?? (typeof params?.id === 'string' ? params.id : undefined),
          requestId,
          metadata: {
            ...contextMetadata(requestAuditAfter),
            ...changedMetadata(requestAuditBefore, requestAuditAfter, auditInput),
            ...resultMetadata(responseValue),
          },
        });
      } catch (error) {
        // L'audit ne doit jamais transformer une opération métier réussie en
        // erreur. L'échec demeure visible dans le journal technique.
        addTechnicalLog({
          timestamp: new Date().toISOString(),
          requestId,
          level: 'error',
          method,
          path,
          status: 500,
          durationMs: Math.round((performance.now() - requestStartedAt) * 100) / 100,
          error: error instanceof Error ? `AuditWrite:${error.name}` : 'AuditWrite:UnknownError',
        });
      }
    }
  })
  .onError({ as: 'global' }, ({ request, path, set, error, code, requestId, requestStartedAt }) => {
    const resolvedRequestId = requestId ?? crypto.randomUUID();
    set.headers['x-request-id'] = resolvedRequestId;
    const resolvedStatus = statusNumber(set.status) >= 400 ? statusNumber(set.status) : 500;
    const technicalEvent = {
      timestamp: new Date().toISOString(),
      requestId: resolvedRequestId,
      level: resolvedStatus >= 500 ? 'error' as const : 'warning' as const,
      method: request.method,
      path,
      status: resolvedStatus,
      durationMs: requestStartedAt === undefined
        ? 0
        : Math.round((performance.now() - requestStartedAt) * 100) / 100,
      error: error instanceof Error ? error.name : 'UnknownError',
      errorCode: typeof code === 'string' ? code : 'UNHANDLED_ERROR',
    } as const;
    addTechnicalLog(technicalEvent);
    void persistTechnicalLog(technicalEvent).catch(() => undefined);
  });
