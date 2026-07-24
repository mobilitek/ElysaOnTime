import { describe, expect, test } from 'bun:test';
import { firstDescriptionLine, possibleWorkingMinutes, shiftPeriod } from './WorkLogPage';

describe('work log description preview', () => {
  test('keeps only the first line in the table preview', () => {
    expect(firstDescriptionLine('Résumé du travail\n- Première tâche\n- Deuxième tâche')).toBe('Résumé du travail');
    expect(firstDescriptionLine('Une seule ligne')).toBe('Une seule ligne');
    expect(firstDescriptionLine('Windows\r\nDeuxième ligne')).toBe('Windows');
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
