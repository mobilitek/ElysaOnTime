import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const testEmail = `auth-${crypto.randomUUID()}@example.com`;
let userId: string | undefined;
let duplicateUserId: string | undefined;
let registeredUserId: string | undefined;

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const { users } = await import('../../db/schema');
const { createUser } = await import('./service');

describe.skipIf(!runIntegrationTests)('authentication integration', () => {
  beforeAll(async () => {
    const user = await createUser({
      email: testEmail,
      password: 'integration-password',
      firstName: 'Integration',
      lastName: 'Test',
    });
    userId = user.id;
    duplicateUserId = (await createUser({ email: `duplicate-${crypto.randomUUID()}@example.com`, password: 'duplicate-password', firstName: 'Duplicate', lastName: 'User' })).id;
  });

  afterAll(async () => {
    if (userId) {
      await database.delete(users).where(eq(users.id, userId));
    }
    if (duplicateUserId) await database.delete(users).where(eq(users.id, duplicateUserId));
    if (registeredUserId) await database.delete(users).where(eq(users.id, registeredUserId));
  });

  test('rejects invalid credentials', async () => {
    const response = await createApp().handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'wrong-password',
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  test('registers a new user and rejects a duplicate email', async () => {
    const email = `register-${crypto.randomUUID()}@example.com`; const app = createApp();
    const response = await app.handle(new Request('http://localhost/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: ' New ', lastName: ' User ', email: email.toUpperCase(), password: 'register-password' }) }));
    expect(response.status).toBe(201); const payload = (await response.json()) as { user: { id: string; email: string; firstName: string; lastName: string } }; registeredUserId = payload.user.id;
    expect(payload.user).toMatchObject({ email, firstName: 'New', lastName: 'User' });
    const duplicate = await app.handle(new Request('http://localhost/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Other', lastName: 'User', email, password: 'register-password' }) }));
    expect(duplicate.status).toBe(409);
  });

  test('creates, reads and deletes a session', async () => {
    const app = createApp();
    const loginResponse = await app.handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: testEmail.toUpperCase(),
          password: 'integration-password',
          rememberMe: true,
        }),
      }),
    );

    expect(loginResponse.status).toBe(200);
    expect(await loginResponse.json()).toEqual({
      user: {
        id: expect.any(String),
        email: testEmail,
        firstName: 'Integration',
        lastName: 'Test',
      },
    });

    const setCookie = loginResponse.headers.get('set-cookie');
    expect(setCookie).toContain('ontime_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=2592000');

    const sessionCookie = setCookie?.split(';', 1)[0];
    if (!sessionCookie) {
      throw new Error('Expected a session cookie');
    }

    const sessionResponse = await app.handle(
      new Request('http://localhost/api/auth/session', {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(sessionResponse.status).toBe(200);

    const logoutResponse = await app.handle(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: sessionCookie },
      }),
    );
    expect(logoutResponse.status).toBe(200);

    const expiredSessionResponse = await app.handle(
      new Request('http://localhost/api/auth/session', {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(expiredSessionResponse.status).toBe(401);
  });

  test('updates the profile and securely changes the password', async () => {
    const app = createApp();
    const login = await app.handle(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: testEmail, password: 'integration-password' }) }));
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]; if (!cookie) throw new Error('Expected cookie');
    const duplicate = await database.select({ email: users.email }).from(users).where(eq(users.id, duplicateUserId!)).limit(1);
    const conflict = await app.handle(new Request('http://localhost/api/auth/profile', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Updated', lastName: 'Person', email: duplicate[0]!.email.toUpperCase() }) }));
    expect(conflict.status).toBe(409);
    const updatedEmail = `updated-${crypto.randomUUID()}@example.com`;
    const update = await app.handle(new Request('http://localhost/api/auth/profile', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ firstName: ' Updated ', lastName: ' Person ', email: updatedEmail.toUpperCase() }) }));
    expect(update.status).toBe(200); expect((await update.json()) as object).toMatchObject({ user: { email: updatedEmail, firstName: 'Updated', lastName: 'Person' } });
    const invalid = await app.handle(new Request('http://localhost/api/auth/change-password', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: 'incorrect-password', newPassword: 'new-integration-password' }) }));
    expect(invalid.status).toBe(422);
    const changed = await app.handle(new Request('http://localhost/api/auth/change-password', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: 'integration-password', newPassword: 'new-integration-password' }) }));
    expect(changed.status).toBe(200);
    const oldLogin = await app.handle(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: updatedEmail, password: 'integration-password' }) }));
    const newLogin = await app.handle(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: updatedEmail, password: 'new-integration-password' }) }));
    expect(oldLogin.status).toBe(401); expect(newLogin.status).toBe(200);
  });
});
