import { describe, expect, test } from 'bun:test';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupDocument, InvalidBackupFileError, parseBackupFile, validateBackup } from './service';

const validBackup: BackupDocument = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: '2026-07-23T12:00:00.000Z',
  data: {
    clients: [{ id: '10000000-0000-4000-8000-000000000001', name: 'Client', isActive: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
    projects: [{ id: '20000000-0000-4000-8000-000000000001', clientId: '10000000-0000-4000-8000-000000000001', name: 'Projet', hourlyRate: '125.50', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
    workEntries: [{ id: '30000000-0000-4000-8000-000000000001', projectId: '20000000-0000-4000-8000-000000000001', workDate: '2026-07-23', durationMinutes: 60, description: 'Travail', hourlyRate: '125.50', amount: '125.50', isBilled: true, isDeleted: true, createdAt: '2026-07-23T12:00:00.000Z', updatedAt: '2026-07-23T13:00:00.000Z' }],
  },
};

describe('OnTime backup format', () => {
  test('preserves all restorable fields and produces a summary', async () => {
    const file = new File([JSON.stringify(validBackup)], 'OnTime-backup.json', { type: 'application/json' });
    const result = await parseBackupFile(file);
    expect(result.backup).toEqual(validBackup);
    expect(result.analysis).toMatchObject({ clients: 1, projects: 1, entries: 1, billed: 1, deleted: 1, totalMinutes: 60, totalAmount: '125.50', firstDate: '2026-07-23', lastDate: '2026-07-23' });
    expect(result.analysis.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  test('rejects broken relationships', () => {
    const broken = structuredClone(validBackup);
    broken.data.projects[0]!.clientId = '10000000-0000-4000-8000-000000000099';
    expect(() => validateBackup(broken)).toThrow(InvalidBackupFileError);
  });

  test('preserves negative historical entry adjustments', () => {
    const adjustment = structuredClone(validBackup);
    adjustment.data.workEntries[0]!.hourlyRate = '-125.50';
    adjustment.data.workEntries[0]!.amount = '-125.50';
    expect(validateBackup(adjustment).data.workEntries[0]).toMatchObject({
      hourlyRate: '-125.50',
      amount: '-125.50',
    });
  });

  test('rejects another file format or extension', async () => {
    expect(() => validateBackup({ ...validBackup, version: 2 })).toThrow('UNSUPPORTED_BACKUP_FORMAT');
    await expect(parseBackupFile(new File(['{}'], 'backup.xlsx'))).rejects.toThrow('JSON_REQUIRED');
  });
});
