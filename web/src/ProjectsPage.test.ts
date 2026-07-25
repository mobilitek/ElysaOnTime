import { describe, expect, test } from 'bun:test';
import { projectRateInputType } from './ProjectsPage';

describe('project hourly-rate confidentiality', () => {
  test('masks the rate until the user explicitly reveals it', () => {
    expect(projectRateInputType(true, false)).toBe('password');
    expect(projectRateInputType(true, true)).toBe('text');
  });

  test('keeps the rate visible when confidential mode is disabled', () => {
    expect(projectRateInputType(false, false)).toBe('text');
  });
});
