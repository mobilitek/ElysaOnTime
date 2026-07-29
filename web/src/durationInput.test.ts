import { describe, expect, test } from 'bun:test';
import {
  completeProgressiveDuration,
  completeWholeHours,
  normalizeDurationInput,
  progressiveDurationInput,
} from './durationInput';

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

describe('quick duration input normalization', () => {
  test('completes hours without requiring a leading zero or minutes', () => {
    expect(normalizeDurationInput('8')).toBe('08:00');
    expect(normalizeDurationInput('08')).toBe('08:00');
  });

  test('inserts the separator in compact hour and minute values', () => {
    expect(normalizeDurationInput('730')).toBe('07:30');
    expect(normalizeDurationInput('0730')).toBe('07:30');
    expect(normalizeDurationInput('7:30')).toBe('07:30');
  });

  test('leaves invalid or incomplete values available for validation', () => {
    expect(normalizeDurationInput('7:75')).toBeNull();
    expect(normalizeDurationInput('abc')).toBeNull();
    expect(normalizeDurationInput('')).toBeNull();
  });
});

describe('progressive duration mask', () => {
  test('formats every digit while waiting for minutes', () => {
    expect(progressiveDurationInput('7')).toBe('07:');
    expect(progressiveDurationInput('73')).toBe('07:3');
    expect(progressiveDurationInput('730')).toBe('07:30');
  });

  test('accepts two-digit hours before collecting minutes', () => {
    expect(progressiveDurationInput('1')).toBe('01:');
    expect(progressiveDurationInput('11')).toBe('11:');
    expect(progressiveDurationInput('1130')).toBe('11:30');
  });

  test('completes missing minutes when leaving the field', () => {
    expect(completeProgressiveDuration('7', '08:00')).toBe('07:00');
    expect(completeProgressiveDuration('73', '08:00')).toBe('07:30');
    expect(completeProgressiveDuration('', '08:00')).toBe('08:00');
  });
});
