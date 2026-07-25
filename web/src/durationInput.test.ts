import { describe, expect, test } from 'bun:test';
import { completeWholeHours } from './durationInput';

describe('hour input completion', () => {
  test('proposes a complete HH:MM value for whole hours', () => {
    expect(completeWholeHours('4')).toBe('04:00');
    expect(completeWholeHours('40')).toBe('40:00');
    expect(completeWholeHours('0')).toBe('00:00');
  });

  test('leaves complete or ambiguous values to normal validation', () => {
    expect(completeWholeHours('04:00')).toBeNull();
    expect(completeWholeHours('4.5')).toBeNull();
    expect(completeWholeHours('abc')).toBeNull();
  });

  test('accepts negative whole hours only when explicitly allowed', () => {
    expect(completeWholeHours('-4')).toBeNull();
    expect(completeWholeHours('-4', true)).toBe('-04:00');
  });
});
