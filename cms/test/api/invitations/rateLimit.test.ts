import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeRedis } from '../../helpers/fakeRedis';
import {
  getAuthProtectionTelemetrySnapshot,
  resetAuthProtectionTelemetry,
} from '../../../app/api/_lib/authProtectionTelemetry';

const fakeRedis = new FakeRedis();

vi.mock('@/src/utils/redisClient', () => ({
  getRedisClient: () => fakeRedis,
}));

import {
  evaluateInviteRateLimit,
  INVITE_RATE_LIMIT_MAX,
  INVITE_RATE_LIMIT_WINDOW_MS,
  resetInviteRateLimitState,
} from '../../../app/api/invitations/rateLimiter.ts';

const TEST_KEY = 'tester-1:127.0.0.1';

describe('evaluateInviteRateLimit', () => {
  beforeEach(async () => {
    fakeRedis.clear();
    await resetInviteRateLimitState(TEST_KEY);
    resetAuthProtectionTelemetry();
    vi.useRealTimers();
  });

  it('allows the first request and tracks remaining quota', async () => {
    const result = await evaluateInviteRateLimit(TEST_KEY);
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(INVITE_RATE_LIMIT_MAX - 1);
    expect(new Date(result.retryAtIso).getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks once the quota is exhausted', async () => {
    for (let index = 0; index < INVITE_RATE_LIMIT_MAX; index += 1) {
      const { limited } = await evaluateInviteRateLimit(TEST_KEY);
      expect(limited).toBe(false);
    }
    const limitedResult = await evaluateInviteRateLimit(TEST_KEY);
    expect(limitedResult.limited).toBe(true);
    expect(limitedResult.remaining).toBe(0);
  });

  it('resets after the cooldown window passes', async () => {
    vi.useFakeTimers();
    for (let index = 0; index < INVITE_RATE_LIMIT_MAX; index += 1) {
      await evaluateInviteRateLimit(TEST_KEY);
    }

    expect((await evaluateInviteRateLimit(TEST_KEY)).limited).toBe(true);

    vi.advanceTimersByTime(INVITE_RATE_LIMIT_WINDOW_MS + 1000);

    const afterReset = await evaluateInviteRateLimit(TEST_KEY);
    expect(afterReset.limited).toBe(false);
    expect(afterReset.remaining).toBe(INVITE_RATE_LIMIT_MAX - 1);
  });

  it('fails closed when Redis is unavailable and records degraded telemetry', async () => {
    vi.spyOn(fakeRedis, 'incr').mockRejectedValueOnce(new Error('redis unavailable'));

    const result = await evaluateInviteRateLimit(TEST_KEY);

    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.degraded).toEqual({
      mode: 'fail_closed',
      reason: 'redis_unavailable',
    });

    const telemetry = getAuthProtectionTelemetrySnapshot();
    expect(telemetry.observedEvents).toBe(2);
    expect(telemetry.counters).toEqual(
      expect.arrayContaining([
        { key: 'invites:redis_unavailable:fail_closed', value: 1 },
        { key: 'invites:degraded_block:fail_closed', value: 1 },
      ]),
    );
  });
});
