import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const email = `projects-${crypto.randomUUID()}@example.com`;
let userId = '';
let clientId = '';
let cookie = '';

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const { clients, projects, users, workEntries } = await import('../../db/schema');
const { authenticate, createUser } = await import('../auth/service');
const { createClient } = await import('../clients/service');

describe.skipIf(!runIntegrationTests)('projects integration', () => {
  beforeAll(async () => {
    const user = await createUser({ email, password: 'integration-password', firstName: 'Project', lastName: 'Test' });
    userId = user.id;
    clientId = (await createClient(user.id, '5xperts - Garda')).id;
    const session = await authenticate(email, 'integration-password', false);
    if (!session) throw new Error('Expected a session');
    cookie = `ontime_session=${session.token}`;
  });

  afterAll(async () => {
    if (userId) {
      await database.delete(workEntries).where(eq(workEntries.userId, userId));
      await database.delete(projects).where(eq(projects.clientId, clientId));
      await database.delete(clients).where(eq(clients.userId, userId));
      await database.delete(users).where(eq(users.id, userId));
    }
  });

  test('creates, lists and enforces unique project names per client', async () => {
    const app = createApp();
    const response = await app.handle(new Request('http://localhost/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ clientId, name: 'Mandat 1', hourlyRate: '85.00' }),
    }));
    expect(response.status).toBe(201);
    const project = ((await response.json()) as { project: { id: string; hourlyRate: string } }).project;
    expect(project.hourlyRate).toBe('85.00');

    const duplicate = await app.handle(new Request('http://localhost/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ clientId, name: 'mandat 1', hourlyRate: '90.00' }),
    }));
    expect(duplicate.status).toBe(409);

    const list = await app.handle(new Request(`http://localhost/api/projects?clientId=${clientId}`, { headers: { cookie } }));
    expect(list.status).toBe(200);
    expect(((await list.json()) as { projects: unknown[] }).projects).toHaveLength(1);
  });

  test('updates the rate only on unbilled entries when requested', async () => {
    const [project] = await database.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.name, 'Mandat 1'))).limit(1);
    if (!project) throw new Error('Expected project');

    await database.insert(workEntries).values([
      { userId, projectId: project.id, workDate: '2026-07-17', durationMinutes: 90, description: 'Unbilled', hourlyRate: '85.00', amount: '127.50' },
      { userId, projectId: project.id, workDate: '2026-07-16', durationMinutes: 60, description: 'Billed', hourlyRate: '85.00', amount: '85.00', isBilled: true },
    ]);

    const response = await createApp().handle(new Request(`http://localhost/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ hourlyRate: '90.00', rateUpdateMode: 'update_unbilled' }),
    }));
    expect(response.status).toBe(200);

    const entries = await database.select({ description: workEntries.description, rate: workEntries.hourlyRate, amount: workEntries.amount })
      .from(workEntries).where(eq(workEntries.projectId, project.id));
    expect(entries.find((entry) => entry.description === 'Unbilled')).toMatchObject({ rate: '90.00', amount: '135.00' });
    expect(entries.find((entry) => entry.description === 'Billed')).toMatchObject({ rate: '85.00', amount: '85.00' });
  });
});
