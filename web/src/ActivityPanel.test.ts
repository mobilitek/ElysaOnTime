import { describe, expect, test } from 'bun:test';
import { auditDetailValue, auditEventContext } from './ActivityPanel';

describe('audit confidential display', () => {
  test('masks monetary values while preserving operational details', () => {
    expect(auditDetailValue('hourlyRate', '125.00', 'fr', true)).toBe('••••');
    expect(auditDetailValue('amount', '1000.00', 'fr', true)).toBe('••••');
    expect(auditDetailValue('project', 'Projet A', 'fr', true)).toBe('Projet A');
    expect(auditDetailValue('workedMinutes', 450, 'fr', true)).toBe('07:30');
  });

  test('shows monetary values when confidential mode is disabled', () => {
    expect(auditDetailValue('hourlyRate', '125.00', 'en', false)).toBe('125.00 $');
    expect(auditDetailValue('amount', '1000.00', 'en', false)).toBe('1000.00 $');
  });
});

describe('audit activity context', () => {
  test('summarizes a work-entry target without exposing its description', () => {
    expect(auditEventContext({
      id: 'event', actorFirstName: 'Eric', actorLastName: 'Tremblay',
      actorEmail: 'eric@example.com', action: 'journal.updated', category: 'journal',
      requestId: crypto.randomUUID(), createdAt: new Date().toISOString(),
      metadata: {
        after_workDate: '2026-07-29',
        after_client: 'Garda',
        after_project: 'Mandat 5',
      },
    }, 'fr')).toContain('Garda · Mandat 5');
  });
});
