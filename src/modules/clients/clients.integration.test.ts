import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const testEmail = `clients-${crypto.randomUUID()}@example.com`;
let userId: string | undefined;
let sessionCookie: string;

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const { clients, users } = await import('../../db/schema');
const { authenticate, createUser } = await import('../auth/service');

describe.skipIf(!runIntegrationTests)('clients integration', () => {
  beforeAll(async () => {
    const user = await createUser({
      email: testEmail,
      password: 'integration-password',
      firstName: 'Client',
      lastName: 'Test',
    });
    userId = user.id;
    const session = await authenticate(testEmail, 'integration-password', false);
    if (!session) throw new Error('Expected an authenticated session');
    sessionCookie = `ontime_session=${session.token}`;
  });

  afterAll(async () => {
    if (userId) {
      await database.delete(clients).where(eq(clients.userId, userId));
      await database.delete(users).where(eq(users.id, userId));
    }
  });

  test('requires authentication', async () => {
    const response = await createApp().handle(new Request('http://localhost/api/clients'));
    expect(response.status).toBe(401);
  });

  test('creates, lists, edits and deactivates a client', async () => {
    const app = createApp();
    const createResponse = await app.handle(new Request('http://localhost/api/clients', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({ name: 'Mobilitek' }),
    }));
    expect(createResponse.status).toBe(201);
    const created = ((await createResponse.json()) as { client: { id: string; name: string; isActive: boolean } }).client;
    expect(created).toMatchObject({ name: 'Mobilitek', isActive: true });

    const duplicateResponse = await app.handle(new Request('http://localhost/api/clients', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({ name: 'mobilitek' }),
    }));
    expect(duplicateResponse.status).toBe(409);

    const updateResponse = await app.handle(new Request(`http://localhost/api/clients/${created.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({ name: 'Mobilitek Inc.', isActive: false }),
    }));
    expect(updateResponse.status).toBe(200);
    expect(((await updateResponse.json()) as { client: unknown }).client).toMatchObject({
      name: 'Mobilitek Inc.', isActive: false,
    });

    const listResponse = await app.handle(new Request('http://localhost/api/clients', {
      headers: { cookie: sessionCookie },
    }));
    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { clients: unknown[] }).clients).toHaveLength(1);
  });
});
