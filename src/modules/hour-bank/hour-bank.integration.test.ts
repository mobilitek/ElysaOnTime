import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const run = process.env.RUN_INTEGRATION_TESTS === '1';
const email = `hour-bank-${crypto.randomUUID()}@example.com`;
let userId = '';
let clientId = '';
let projectId = '';
let cookie = '';

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const {
  clients,
  hourBankClosures,
  projects,
  users,
  workEntries,
} = await import('../../db/schema');
const { authenticate, createUser } = await import('../auth/service');
const { createClient, updateClient } = await import('../clients/service');
const { createProject } = await import('../projects/service');
const { createEntry } = await import('../work-entries/service');

const request = (path: string, method = 'GET', body?: unknown) =>
  createApp().handle(new Request(`http://localhost${path}`, {
    method,
    headers: {
      cookie,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));

describe.skipIf(!run)('hour bank integration', () => {
  beforeAll(async () => {
    const user = await createUser({
      email,
      password: 'integration-password',
      firstName: 'Hour',
      lastName: 'Bank',
    });
    userId = user.id;
    clientId = (await createClient(userId, 'Hour bank client')).id;
    await updateClient(userId, clientId, {
      hourBankEnabled: true,
      hourBankStartDate: '2026-07-18',
      hourBankInitialMinutes: 60,
      maxDailyBillableMinutes: 480,
      maxWeeklyBillableMinutes: 2400,
    });
    projectId = (await createProject(userId, {
      clientId,
      name: 'Hour bank project',
      hourlyRate: '100.00',
    })).id;
    await createEntry(userId, {
      projectId,
      workDate: '2026-07-20',
      durationMinutes: 540,
      clientMinutes: 480,
      description: 'Nine actual hours',
    });
    const session = await authenticate(email, 'integration-password', false);
    if (!session) throw new Error('Expected session');
    cookie = `ontime_session=${session.token}`;
  });

  afterAll(async () => {
    if (!userId) return;
    await database.delete(hourBankClosures).where(eq(hourBankClosures.userId, userId));
    await database.delete(workEntries).where(eq(workEntries.userId, userId));
    await database.delete(projects).where(eq(projects.clientId, clientId));
    await database.delete(clients).where(eq(clients.userId, userId));
    await database.delete(users).where(eq(users.id, userId));
  });

  test('proposes, closes and revises a week with a negative balance allowed', async () => {
    const proposalResponse = await request(
      `/api/hour-bank/week?clientId=${clientId}&weekStart=2026-07-18`,
    );
    expect(proposalResponse.status).toBe(200);
    const proposal = await proposalResponse.json() as {
      days: Array<{ workDate: string; actualMinutes: number; billedMinutes: number }>;
      openingBalanceMinutes: number;
      isClosed: boolean;
    };
    expect(proposal.openingBalanceMinutes).toBe(60);
    expect(proposal.isClosed).toBe(false);
    expect(proposal.days.find((day) => day.workDate === '2026-07-20')).toMatchObject({
      actualMinutes: 540,
      billedMinutes: 480,
    });

    const closeResponse = await request('/api/hour-bank/week', 'PUT', {
      clientId,
      weekStart: '2026-07-18',
      note: 'Vacation buffer',
    });
    expect(closeResponse.status).toBe(200);
    const closed = await closeResponse.json() as {
      isClosed: boolean;
      closingBalanceMinutes: number;
    };
    expect(closed.isClosed).toBe(true);
    expect(closed.closingBalanceMinutes).toBe(120);

    const exportResponse = await request(
      `/api/work-entries/export?from=2026-07-20&to=2026-07-20&clientId=${clientId}&includeDeleted=false&confidential=true&language=fr`,
    );
    expect(exportResponse.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportResponse.arrayBuffer());
    const sheet = workbook.worksheets[0]!;
    const headers = (sheet.getRow(1).values as unknown[]).map(String);
    const descriptionColumn = headers.indexOf('Description');
    const hoursColumn = headers.indexOf('Hours');
    expect(sheet.getRow(2).getCell(descriptionColumn).text).toContain('- Code H: 2 (1+1)');
    const hours = sheet.getRow(2).getCell(hoursColumn).value;
    expect(hours).toBeInstanceOf(Date);
    expect((hours as Date).getUTCHours()).toBe(8);
  });

  test('rejects client time over the configured eight-hour daily maximum', async () => {
    const response = await request('/api/work-entries', 'POST', {
      projectId,
      workDate: '2026-07-21',
      durationMinutes: 495,
      clientMinutes: 495,
      description: 'Over client maximum',
    });
    expect(response.status).toBe(422);
  });
});
