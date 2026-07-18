import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const testEmail = `auth-${crypto.randomUUID()}@example.com`;
let userId: string | undefined;

const { createApp } = await import('../../app');
const { database, closeDatabase } = await import('../../database');
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
  });

  afterAll(async () => {
    if (userId) {
      await database.delete(users).where(eq(users.id, userId));
    }
    await closeDatabase();
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
});
