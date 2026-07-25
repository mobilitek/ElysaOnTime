import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const adminEmail = `admin-${crypto.randomUUID()}@example.com`;
const regularEmail = `regular-${crypto.randomUUID()}@example.com`;
const createdEmail = `managed-${crypto.randomUUID()}@example.com`;
const expiredEmail = `expired-${crypto.randomUUID()}@example.com`;
const userIds: string[] = [];
let adminCookie = '';
let regularCookie = '';

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const { sessions, users } = await import('../../db/schema');
const {
  createPasswordReset,
  createUser,
  resetPassword,
  setAdminByEmail,
} = await import('../auth/service');

const login = async (email: string, password: string) => {
  const response = await createApp().handle(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
  return {
    response,
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0] ?? '',
  };
};

describe.skipIf(!runIntegrationTests)('user administration integration', () => {
  beforeAll(async () => {
    const admin = await createUser({
      firstName: 'Admin',
      lastName: 'Integration',
      email: adminEmail,
      password: 'integration-password',
    });
    const regular = await createUser({
      firstName: 'Regular',
      lastName: 'Integration',
      email: regularEmail,
      password: 'integration-password',
    });
    userIds.push(admin.id, regular.id);
    await setAdminByEmail(adminEmail, true);
    adminCookie = (await login(adminEmail, 'integration-password')).cookie;
    regularCookie = (await login(regularEmail, 'integration-password')).cookie;
  });

  afterAll(async () => {
    if (userIds.length === 0) return;
    await database.delete(sessions).where(inArray(sessions.userId, userIds));
    await database.delete(users).where(inArray(users.id, userIds));
  });

  test('refuses the administration API to a regular user', async () => {
    const response = await createApp().handle(new Request(
      'http://localhost/api/admin/users?page=1&pageSize=25',
      { headers: { cookie: regularCookie } },
    ));
    expect(response.status).toBe(403);
  });

  test('creates, lists and suspends a managed user', async () => {
    const app = createApp();
    const create = await app.handle(new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Managed',
        lastName: 'User',
        email: createdEmail,
        password: 'managed-password',
        isAdmin: false,
        accountStatus: 'active',
        subscriptionStartedOn: '2026-01-01',
        subscriptionEndsOn: null,
      }),
    }));
    expect(create.status).toBe(201);
    const created = (await create.json()) as { user: { id: string } };
    userIds.push(created.user.id);

    const list = await app.handle(new Request(
      `http://localhost/api/admin/users?search=${encodeURIComponent(createdEmail)}&page=1&pageSize=25`,
      { headers: { cookie: adminCookie } },
    ));
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      total: 1,
      users: [{ id: created.user.id, accountStatus: 'active' }],
    });

    const update = await app.handle(new Request(
      `http://localhost/api/admin/users/${created.user.id}`,
      {
        method: 'PATCH',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accountStatus: 'suspended' }),
      },
    ));
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      user: { id: created.user.id, accountStatus: 'suspended' },
    });
    expect((await login(createdEmail, 'managed-password')).response.status).toBe(401);
  });

  test('records a paid renewal and exposes it in the user profile', async () => {
    const [regular] = await database.select({ id: users.id })
      .from(users).where(eq(users.email, regularEmail)).limit(1);
    const create = await createApp().handle(new Request(
      `http://localhost/api/admin/users/${regular!.id}/subscriptions`,
      {
        method: 'POST',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          periodStartedOn: '2026-08-01',
          periodEndsOn: '2027-07-31',
          paymentDate: '2026-07-25',
          amount: '0.00',
          subscriptionType: 'free',
          paymentStatus: 'paid',
          paymentProvider: 'manual',
          externalReference: null,
          note: 'Free launch period',
        }),
      },
    ));
    expect(create.status).toBe(201);

    const overview = await createApp().handle(new Request(
      'http://localhost/api/subscriptions',
      { headers: { cookie: regularCookie } },
    ));
    expect(overview.status).toBe(200);
    expect(await overview.json()).toMatchObject({
      current: {
        subscriptionStartedOn: '2026-08-01',
        subscriptionEndsOn: '2027-07-31',
      },
      history: [{
        amount: '0.00',
        subscriptionType: 'free',
        paymentStatus: 'paid',
        paymentDate: '2026-07-25',
      }],
    });
  });

  test('limits an expired subscription without blocking account recovery', async () => {
    const expired = await createUser({
      firstName: 'Expired',
      lastName: 'User',
      email: expiredEmail,
      password: 'expired-password',
    });
    userIds.push(expired.id);
    await database.update(users).set({
      subscriptionStartedOn: '2020-01-01',
      subscriptionEndsOn: '2020-12-31',
    }).where(eq(users.id, expired.id));
    const expiredLogin = await login(expiredEmail, 'expired-password');
    expect(expiredLogin.response.status).toBe(200);
    expect(await expiredLogin.response.json()).toMatchObject({
      user: { accessLevel: 'subscription_expired' },
    });
    const forbiddenMutation = await createApp().handle(new Request(
      'http://localhost/api/clients',
      {
        method: 'POST',
        headers: { cookie: expiredLogin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Forbidden client' }),
      },
    ));
    expect(forbiddenMutation.status).toBe(403);
    expect(await forbiddenMutation.json()).toEqual({ error: 'SUBSCRIPTION_REQUIRED' });
    const backup = await createApp().handle(new Request(
      'http://localhost/api/backup/download',
      { headers: { cookie: expiredLogin.cookie } },
    ));
    expect(backup.status).toBe(200);

    const reset = await createPasswordReset(expiredEmail);
    expect(reset).not.toBeNull();
    expect(await resetPassword(reset!.token, 'renewed-password')).toBe(true);
    expect((await login(expiredEmail, 'renewed-password')).response.status).toBe(200);
  });

  test('protects the current administrator', async () => {
    const [admin] = await database.select({ id: users.id })
      .from(users).where(eq(users.email, adminEmail)).limit(1);
    const response = await createApp().handle(new Request(
      `http://localhost/api/admin/users/${admin!.id}`,
      {
        method: 'PATCH',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ isAdmin: false }),
      },
    ));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'PROTECTED_ADMINISTRATOR' });
  });
});
