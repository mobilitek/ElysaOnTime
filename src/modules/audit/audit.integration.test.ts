import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

const run = process.env.RUN_INTEGRATION_TESTS === '1';
const email = `audit-${crypto.randomUUID()}@example.com`;
let userId = '';
let cookie = '';
let profileRequestId = '';

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const { auditEvents, users } = await import('../../db/schema');
const { authenticate, createUser } = await import('../auth/service');

const request = (path: string, method = 'GET', body?: unknown) =>
  createApp().handle(new Request(`http://localhost${path}`, {
    method,
    headers: {
      cookie,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));

describe.skipIf(!run)('audit integration', () => {
  beforeAll(async () => {
    const user = await createUser({
      email,
      password: 'integration-password',
      firstName: 'Audit',
      lastName: 'Test',
    });
    userId = user.id;
    const session = await authenticate(email, 'integration-password', false);
    if (!session) throw new Error('Expected session');
    cookie = `ontime_session=${session.token}`;
  });

  afterAll(async () => {
    if (!userId) return;
    await database.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    await database.delete(users).where(eq(users.id, userId));
  });

  test('records a safe user-visible event with a request identifier', async () => {
    const mutation = await request('/api/auth/profile', 'PATCH', {
      firstName: 'Audit updated',
      lastName: 'Test',
      email,
    });
    expect(mutation.status).toBe(200);
    expect(mutation.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

    const activity = await request('/api/audit/mine?page=1&pageSize=25');
    expect(activity.status).toBe(200);
    const payload = await activity.json() as {
      events: Array<{ action: string; metadata: Record<string, unknown>; requestId: string }>;
    };
    expect(payload.events[0]).toMatchObject({ action: 'account.updated' });
    expect(payload.events[0]?.metadata).not.toHaveProperty('password');
    profileRequestId = payload.events[0]?.requestId ?? '';
  });

  test('refuses technical logs to a regular user', async () => {
    expect((await request('/api/audit/technical?page=1&pageSize=10')).status).toBe(403);
  });

  test('does not record a rejected mutation as successful activity', async () => {
    const before = await request('/api/audit/mine?page=1&pageSize=25');
    const beforeTotal = ((await before.json()) as { total: number }).total;
    expect((await request('/api/auth/profile', 'PATCH', {
      firstName: '',
      lastName: 'Test',
      email,
    })).status).toBe(422);
    const after = await request('/api/audit/mine?page=1&pageSize=25');
    expect(((await after.json()) as { total: number }).total).toBe(beforeTotal);
  });

  test('persists and filters technical logs for administrators', async () => {
    await database.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
    const activity = await request('/api/audit/admin?page=1&pageSize=5');
    expect(activity.status).toBe(200);
    const linked = await request(`/api/audit/technical?requestId=${profileRequestId}&page=1&pageSize=5`);
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      logs: [{
        requestId: profileRequestId,
        activity: {
          action: 'account.updated',
          actorEmail: email,
        },
      }],
    });
    const response = await request('/api/audit/technical?level=warning&status=422&path=profile&page=1&pageSize=25');
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      logs: Array<{ status: number; level: string; path: string; errorCode?: string }>;
    };
    expect(payload.logs.some((log) =>
      log.status === 422 && log.level === 'warning' && log.path === '/api/auth/profile')).toBe(true);
    await database.update(users).set({ isAdmin: false }).where(eq(users.id, userId));
  });
});
