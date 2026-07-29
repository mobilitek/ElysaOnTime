import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const run = process.env.RUN_INTEGRATION_TESTS === '1';
const email = `entries-${crypto.randomUUID()}@example.com`;
let userId = ''; let clientId = ''; let projectId = ''; let reassignmentProjectId = ''; let cookie = ''; let entryId = '';

const { createApp } = await import('../../app');
const { database } = await import('../../database');
const { clients, projects, users, workEntries } = await import('../../db/schema');
const { authenticate, createUser } = await import('../auth/service');
const { createClient } = await import('../clients/service');
const { createProject } = await import('../projects/service');
const { exportDescription, exportEntryDescription } = await import('./export');

const request = (path: string, method = 'GET', body?: unknown) => createApp().handle(new Request(`http://localhost${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }));

describe.skipIf(!run)('work entries integration', () => {
  beforeAll(async () => {
    const user = await createUser({ email, password: 'integration-password', firstName: 'Entry', lastName: 'Test' }); userId = user.id;
    clientId = (await createClient(userId, 'Journal client')).id;
    projectId = (await createProject(userId, { clientId, name: 'Journal project', hourlyRate: '89.00' })).id;
    reassignmentProjectId = (await createProject(userId, { clientId, name: 'Reassignment project', hourlyRate: '100.00' })).id;
    const session = await authenticate(email, 'integration-password', false); if (!session) throw new Error('Expected session'); cookie = `ontime_session=${session.token}`;
  });
  afterAll(async () => { if (userId) { await database.delete(workEntries).where(eq(workEntries.userId, userId)); await database.delete(projects).where(eq(projects.clientId, clientId)); await database.delete(clients).where(eq(clients.userId, userId)); await database.delete(users).where(eq(users.id, userId)); } });

  test('creates, lists and calculates an entry from the project rate', async () => {
    const response = await request('/api/work-entries', 'POST', { projectId, workDate: '2026-07-17', durationMinutes: 90, description: 'Friday work' });
    expect(response.status).toBe(201);
    const entry = ((await response.json()) as { entry: { id: string; hourlyRate: string; amount: string } }).entry; entryId = entry.id;
    expect(entry).toMatchObject({ hourlyRate: '89.00', amount: '133.50' });
    const list = await request(`/api/work-entries?from=2026-07-01&to=2026-07-31&clientId=${clientId}&projectId=${projectId}&includeDeleted=false&page=1&pageSize=50&sortBy=workDate&sortDirection=desc`);
    expect(list.status).toBe(200);
    const payload = (await list.json()) as { entries: unknown[]; summary: { itemCount: number; totalMinutes: number; totalAmount: string } };
    expect(payload.entries).toHaveLength(1); expect(payload.summary).toMatchObject({ itemCount: 1, totalMinutes: 90, totalAmount: '133.50' });
  });

  test('rejects durations outside 15-minute increments', async () => {
    expect((await request('/api/work-entries', 'POST', { projectId, workDate: '2026-07-17', durationMinutes: 20, description: 'Invalid' })).status).toBe(422);
  });

  test('rejects inverted date ranges for lists and exports', async () => {
    expect((await request('/api/work-entries?from=2026-07-31&to=2026-07-01&includeDeleted=false&page=1&pageSize=50&sortBy=workDate&sortDirection=desc')).status).toBe(422);
    expect((await request('/api/work-entries/export?from=2026-07-31&to=2026-07-01&includeDeleted=false&confidential=true&language=fr')).status).toBe(422);
  });

  test('stores a free-form hierarchy and derives its compatible text description', async () => {
    const descriptionDocument = [
      { id: 'subject', text: 'SSA-0000', depth: 0, includedInExport: true },
      { id: 'work', text: 'Implemented validation', depth: 1, includedInExport: true },
      { id: 'private', text: 'Internal investigation', depth: 2, includedInExport: false },
    ];
    const response = await request(`/api/work-entries/${entryId}`, 'PATCH', {
      projectId,
      workDate: '2026-07-17',
      durationMinutes: 90,
      description: 'Ignored when a structured document is supplied',
      descriptionDocument,
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as { entry: object }).toMatchObject({
      entry: {
        description: '- SSA-0000\n  - Implemented validation\n    - Internal investigation',
        descriptionDocument,
      },
    });
  });

  test('reassigns an unbilled entry and adopts the target project rate', async () => {
    const response = await request(`/api/work-entries/${entryId}`, 'PATCH', {
      projectId: reassignmentProjectId,
      workDate: '2026-07-17',
      durationMinutes: 90,
      description: 'Reassigned work',
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as { entry: object }).toMatchObject({
      entry: {
        projectId: reassignmentProjectId,
        hourlyRate: '100.00',
        amount: '150.00',
      },
    });
    const activity = await request('/api/audit/mine?category=journal&page=1&pageSize=25');
    expect(activity.status).toBe(200);
    const audit = (await activity.json()) as {
      events: Array<{ action: string; metadata: Record<string, unknown> }>;
    };
    expect(audit.events[0]).toMatchObject({
      action: 'journal.updated',
      metadata: {
        before_project: 'Journal project',
        after_project: 'Reassignment project',
        before_hourlyRate: '89.00',
        after_hourlyRate: '100.00',
        before_amount: '133.50',
        after_amount: '150.00',
        contentChanged: true,
      },
    });
    projectId = reassignmentProjectId;
  });

  test('removes lines beginning with three hyphens from exported descriptions', () => {
    expect(exportDescription('Visible\n--- Private note\n  --- Also private\n-- Still visible\nVisible again'))
      .toBe('Visible\n-- Still visible\nVisible again');
  });

  test('exports only structured lines explicitly included for the client', () => {
    expect(exportEntryDescription('Legacy fallback', [
      { id: 'one', text: 'Visible', depth: 0, includedInExport: true },
      { id: 'two', text: 'Internal', depth: 1, includedInExport: false },
      { id: 'three', text: 'Visible detail', depth: 2, includedInExport: true },
    ])).toBe('- Visible\n    - Visible detail');
  });

  test('toggles billed and deleted state, and filters deleted entries', async () => {
    expect((await request('/api/work-entries/toggle-billed', 'POST', { ids: [entryId] })).status).toBe(200);
    const reassignment = await request(`/api/work-entries/${entryId}`, 'PATCH', {
      projectId: reassignmentProjectId === projectId ? (await createProject(userId, { clientId, name: 'Locked target', hourlyRate: '120.00' })).id : reassignmentProjectId,
      workDate: '2026-07-17',
      durationMinutes: 90,
      description: 'Must remain assigned',
    });
    expect(reassignment.status).toBe(409);
    expect(await reassignment.json()).toMatchObject({ error: 'BILLED_ENTRY_ASSIGNMENT_LOCKED' });
    expect((await request('/api/work-entries/toggle-deleted', 'POST', { ids: [entryId] })).status).toBe(200);
    const hidden = await request('/api/work-entries?from=2026-07-01&to=2026-07-31&includeDeleted=false&page=1&pageSize=50&sortBy=workDate&sortDirection=desc');
    expect(((await hidden.json()) as { entries: unknown[] }).entries).toHaveLength(0);
    const shown = await request('/api/work-entries?from=2026-07-01&to=2026-07-31&includeDeleted=true&page=1&pageSize=50&sortBy=workDate&sortDirection=desc');
    expect(((await shown.json()) as { entries: Array<{ isBilled: boolean; isDeleted: boolean }> }).entries[0]).toMatchObject({ isBilled: true, isDeleted: true });
  });

  test('duplicates Friday to Monday and preserves historical rate', async () => {
    const response = await request(`/api/work-entries/${entryId}/duplicate`, 'POST', { nextWorkday: true });
    expect(response.status).toBe(201);
    const duplicatedEntry = ((await response.json()) as { entry: { id: string } }).entry;
    expect(duplicatedEntry).toMatchObject({ workDate: '2026-07-20', hourlyRate: '100.00', amount: '150.00', isBilled: false, isDeleted: false });
    const activity = await request('/api/audit/mine?category=journal&page=1&pageSize=5');
    const latestAudit = ((await activity.json()) as {
      events: Array<{ action: string; entityId: string; metadata: Record<string, unknown> }>;
    }).events[0];
    expect(latestAudit).toMatchObject({
      action: 'journal.duplicated',
      entityId: duplicatedEntry.id,
      metadata: {
        workDate: '2026-07-20',
        client: 'Journal client',
        project: 'Reassignment project',
      },
    });

    const occupied = await request(`/api/work-entries/${entryId}/duplicate`, 'POST', { nextWorkday: true });
    expect(occupied.status).toBe(409);
    expect(await occupied.json()).toMatchObject({ error: 'DUPLICATE_TARGET_OCCUPIED', targetDate: '2026-07-20' });

    const confirmed = await request(`/api/work-entries/${entryId}/duplicate`, 'POST', { nextWorkday: true, confirmExisting: true });
    expect(confirmed.status).toBe(201);
    const confirmedEntry = ((await confirmed.json()) as { entry: { id: string } }).entry;
    await database.delete(workEntries).where(eq(workEntries.id, confirmedEntry.id));
  });

  test('exports a confidential legacy-compatible Excel workbook without financial or billed columns', async () => {
    const response = await request(`/api/work-entries/export?from=2026-07-01&to=2026-07-31&clientId=${clientId}&projectId=${projectId}&includeDeleted=true&confidential=true&language=fr`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect(response.headers.get('content-disposition')).toContain('EntryTest_OnTime_Journal client_01-07-2026_to_31-07-2026.xlsx');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet('A'); if (!sheet) throw new Error('Expected A sheet');
    const headers = sheet.getRow(1).values as unknown[];
    expect(headers).toEqual([undefined, 'Day', 'Date', 'Description', 'Hours']);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.autoFilter).toBeUndefined();
    expect(sheet.views ?? []).toEqual([]);
    expect(sheet.getColumn(1).width).toBeCloseTo(11.71428571429);
    expect(sheet.getColumn(3).width).toBeCloseTo(40.28571428571);
    expect(sheet.getColumn(4).numFmt).toBe('HH:mm');
  });

  test('exports dynamic identification and financial columns when not confidential', async () => {
    const response = await request('/api/work-entries/export?from=2026-07-01&to=2026-07-31&includeDeleted=false&confidential=false&language=en');
    const bytes = await response.arrayBuffer();
    if (process.env.EXPORT_QA_PATH) await Bun.write(process.env.EXPORT_QA_PATH, bytes);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet('A'); if (!sheet) throw new Error('Expected A sheet');
    expect(sheet.getRow(1).values).toEqual([undefined, 'Client', 'Project', 'Day', 'Date', 'Description', 'Hours', 'Rate', 'Value']);
    expect(sheet.getRow(sheet.rowCount).getCell(5).value).toBe('Total');
  });
});
