import { afterEach, describe, expect, test } from 'bun:test';
import {
  consumeRateLimit,
  consumeRateLimits,
  requestAddress,
  resetRateLimitsForTests,
} from './rate-limit';

afterEach(resetRateLimitsForTests);

describe('rate limiting', () => {
  test('blocks a key once its fixed window is exhausted', () => {
    const rule = { key: 'login:account:user@example.com', limit: 2, windowMs: 1_000 };

    expect(consumeRateLimit(rule, 1_000)).toBe(true);
    expect(consumeRateLimit(rule, 1_100)).toBe(true);
    expect(consumeRateLimit(rule, 1_200)).toBe(false);
    expect(consumeRateLimit(rule, 2_101)).toBe(true);
  });

  test('requires every independent rule to remain below its limit', () => {
    const rules = [
      { key: 'login:ip:203.0.113.1', limit: 1, windowMs: 1_000 },
      { key: 'login:account:user@example.com', limit: 2, windowMs: 1_000 },
    ];

    expect(consumeRateLimits(rules, 1_000)).toBe(true);
    expect(consumeRateLimits(rules, 1_100)).toBe(false);
  });

  test('uses the address appended by the trusted proxy and falls back safely', () => {
    expect(requestAddress(new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.7, 172.20.0.1' },
    }))).toBe('172.20.0.1');
    expect(requestAddress(new Request('https://example.com'))).toBe('unknown');
  });
});
