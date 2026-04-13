import { describe, expect, it } from 'vitest';

import {
  buildFailClosedRateLimit,
  evaluateInMemoryRateLimit,
  evaluateRedisRateLimit,
} from './authRateLimiter';

describe('authRateLimiter', () => {
  it('evaluates in-memory rate limits with rolling windows', () => {
    const state = new Map();
    const first = evaluateInMemoryRateLimit(state, 'user:1', 2, 60_000);
    const second = evaluateInMemoryRateLimit(state, 'user:1', 2, 60_000);
    const third = evaluateInMemoryRateLimit(state, 'user:1', 2, 60_000);

    expect(first.limited).toBe(false);
    expect(second.limited).toBe(false);
    expect(third.limited).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('evaluates redis-backed rate limits', async () => {
    let count = 0;
    const redis = {
      incr: async () => {
        count += 1;
        return count;
      },
      pttl: async () => 30_000,
      pexpire: async () => 1,
    };

    const result = await evaluateRedisRateLimit(redis, 'key', 1, 60_000);
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('builds fail-closed responses', () => {
    const result = buildFailClosedRateLimit(30_000);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
