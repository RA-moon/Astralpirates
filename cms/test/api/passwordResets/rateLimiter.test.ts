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
  evaluateIpRateLimit,
  evaluateUserRateLimit,
  resetPasswordResetRateLimit,
} from '../../../app/api/password-resets/rateLimiter.ts';

describe('password reset rate limiter', () => {
  beforeEach(async () => {
    fakeRedis.clear();
    await resetPasswordResetRateLimit('user:test@example.com');
    await resetPasswordResetRateLimit('ip:127.0.0.1');
    resetAuthProtectionTelemetry();
    vi.useRealTimers();
  });

  it('limits per-user submissions after the configured quota', async () => {
    for (let index = 0; index < 3; index += 1) {
      const result = await evaluateUserRateLimit('test@example.com:pegasus');
      expect(result.limited).toBe(false);
    }
    const limited = await evaluateUserRateLimit('test@example.com:pegasus');
    expect(limited.limited).toBe(true);
    expect(limited.remaining).toBe(0);
  });

  it('limits by IP address independently of the user', async () => {
    for (let index = 0; index < 10; index += 1) {
      const result = await evaluateIpRateLimit('127.0.0.1');
      expect(result.limited).toBe(false);
    }
    const limited = await evaluateIpRateLimit('127.0.0.1');
    expect(limited.limited).toBe(true);
  });

  it('fails closed when Redis is unavailable and emits degraded telemetry', async () => {
    vi.spyOn(fakeRedis, 'incr').mockRejectedValueOnce(new Error('redis unavailable'));

    const result = await evaluateUserRateLimit('test@example.com:pegasus');

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
        { key: 'password_resets:redis_unavailable:fail_closed', value: 1 },
        { key: 'password_resets:degraded_block:fail_closed', value: 1 },
      ]),
    );
  });
});
