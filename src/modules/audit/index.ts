import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import { listAuditEvents, queryTechnicalLogs } from './service';

const currentUser = async (value: unknown) =>
  getUserBySessionToken(getSessionToken(value));

const filterProperties = {
  category: t.Optional(t.String({ maxLength: 50 })),
  from: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
  to: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
  page: t.Integer({ minimum: 1, default: 1 }),
  pageSize: t.Integer({ minimum: 5, maximum: 100, default: 25 }),
};
const filters = t.Object(filterProperties);

export const auditRoutes = new Elysia({ prefix: '/api/audit' })
  .get('/mine', async ({ cookie, query, status }) => {
    const user = await currentUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    return listAuditEvents({ ...query, userId: user.id });
  }, { query: filters })
  .get('/admin', async ({ cookie, query, status }) => {
    const user = await currentUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user?.isAdmin) return status(403, { error: 'ADMIN_REQUIRED' });
    return listAuditEvents({ ...query, userId: query.userId });
  }, { query: t.Object({
    ...filterProperties,
    userId: t.Optional(t.String({ format: 'uuid' })),
  }) })
  .get('/technical', async ({ cookie, query, status }) => {
    const user = await currentUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user?.isAdmin) return status(403, { error: 'ADMIN_REQUIRED' });
    return queryTechnicalLogs(query);
  }, { query: t.Object({
    level: t.Optional(t.Union([t.Literal('info'), t.Literal('warning'), t.Literal('error')])),
    status: t.Optional(t.Integer({ minimum: 100, maximum: 599 })),
    path: t.Optional(t.String({ maxLength: 200 })),
    requestId: t.Optional(t.String({ format: 'uuid' })),
    userId: t.Optional(t.String({ format: 'uuid' })),
    page: t.Integer({ minimum: 1, default: 1 }),
    pageSize: t.Integer({ minimum: 5, maximum: 100, default: 50 }),
  }) });
