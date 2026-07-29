import { describe, expect, test } from 'bun:test';
import {
  firstDescriptionLine,
  formatWeekday,
  hasEnabledHourBank,
  hourBankBalanceThroughDate,
  possibleWorkingMinutes,
  shiftPeriod,
} from './WorkLogPage';
import {
  descriptionDocumentExportText,
  descriptionDocumentText,
  parseLegacyDescription,
  replaceLineWithPastedText,
} from './descriptionDocument';

describe('work log description preview', () => {
  test('keeps only the first line in the table preview', () => {
    expect(firstDescriptionLine('Résumé du travail\n- Première tâche\n- Deuxième tâche')).toBe('Résumé du travail');
    expect(firstDescriptionLine('Une seule ligne')).toBe('Une seule ligne');
    expect(firstDescriptionLine('Windows\r\nDeuxième ligne')).toBe('Windows');
  });
});

describe('work log weekday labels', () => {
  test('shows the localized weekday for an entry date', () => {
    expect(formatWeekday('2026-07-29', 'fr')).toBe('Mercredi');
    expect(formatWeekday('2026-07-29', 'en')).toBe('Wednesday');
  });
});

describe('structured work log descriptions', () => {
  test('converts legacy hyphen indentation and preserves internal export rules', () => {
    const lines = parseLegacyDescription([
      '-SSA-0000',
      '-- Travail effectué',
      '--- Note interne',
      '---- Détail interne',
      '-SSA-0001',
    ].join('\n'));

    expect(lines.map(({ text, depth, includedInExport }) => ({
      text, depth, includedInExport,
    }))).toEqual([
      { text: 'SSA-0000', depth: 0, includedInExport: true },
      { text: 'Travail effectué', depth: 1, includedInExport: true },
      { text: 'Note interne', depth: 2, includedInExport: false },
      { text: 'Détail interne', depth: 3, includedInExport: false },
      { text: 'SSA-0001', depth: 0, includedInExport: true },
    ]);
    expect(descriptionDocumentText(lines)).toContain('    - Note interne');
    expect(descriptionDocumentExportText(lines)).not.toContain('Note interne');
  });

  test('keeps arbitrary plain text as freely organized top-level lines', () => {
    const lines = parseLegacyDescription('Réunion\nDéveloppement\n  Sous-sujet');
    expect(lines.map(({ text, depth }) => ({ text, depth }))).toEqual([
      { text: 'Réunion', depth: 0 },
      { text: 'Développement', depth: 0 },
      { text: 'Sous-sujet', depth: 1 },
    ]);
  });

  test('turns a multi-line paste into outline rows relative to the target depth', () => {
    const existing = parseLegacyDescription('-- Élément existant');
    const result = replaceLineWithPastedText(
      existing,
      0,
      '- Meeting\n-- Décision\n--- Note privée\n- Tâches',
    );
    expect(result.map(({ text, depth, includedInExport }) => ({
      text, depth, includedInExport,
    }))).toEqual([
      { text: 'Meeting', depth: 1, includedInExport: true },
      { text: 'Décision', depth: 2, includedInExport: true },
      { text: 'Note privée', depth: 3, includedInExport: false },
      { text: 'Tâches', depth: 1, includedInExport: true },
    ]);
  });
});

describe('hour-bank balance for the selected period', () => {
  const week = {
    openingBalanceMinutes: 10_740,
    days: [
      { workDate: '2026-07-27', movementMinutes: 60 },
      { workDate: '2026-07-28', movementMinutes: -30 },
      { workDate: '2026-07-29', movementMinutes: 120 },
    ],
  };

  test('includes the bank when the period ends on its first covered day', () => {
    expect(hourBankBalanceThroughDate(week, '2026-07-27')).toBe(10_800);
  });

  test('does not include movements after the selected period end', () => {
    expect(hourBankBalanceThroughDate(week, '2026-07-28')).toBe(10_770);
  });
});

describe('work log period navigation', () => {
  test('moves a Saturday-to-Friday week by seven days', () => {
    expect(shiftPeriod('week', '2026-07-11', 1)).toEqual({ from: '2026-07-18', to: '2026-07-24' });
    expect(shiftPeriod('week', '2026-07-11', -1)).toEqual({ from: '2026-07-04', to: '2026-07-10' });
  });

  test('moves across month and year boundaries', () => {
    expect(shiftPeriod('month', '2026-12-01', 1)).toEqual({ from: '2027-01-01', to: '2027-01-31' });
    expect(shiftPeriod('year', '2026-01-01', -1)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  test('keeps leap-day navigation valid', () => {
    expect(shiftPeriod('day', '2028-02-28', 1)).toEqual({ from: '2028-02-29', to: '2028-02-29' });
  });
});

describe('possible monthly capacity', () => {
  test('counts eight hours for every weekday and includes holidays', () => {
    expect(possibleWorkingMinutes('2026-07-01', '2026-07-31')).toBe(23 * 8 * 60);
  });

  test('excludes Saturdays and Sundays from a custom period', () => {
    expect(possibleWorkingMinutes('2026-07-03', '2026-07-06')).toBe(2 * 8 * 60);
  });
});

describe('Excel export hour-bank reminder', () => {
  test('is required when at least one active project uses an hour bank', () => {
    expect(hasEnabledHourBank([
      { isActive: true, hourBankEnabled: false },
      { isActive: true, hourBankEnabled: true },
    ])).toBe(true);
  });

  test('ignores disabled banks and inactive projects', () => {
    expect(hasEnabledHourBank([
      { isActive: true, hourBankEnabled: false },
      { isActive: false, hourBankEnabled: true },
    ])).toBe(false);
  });
});
