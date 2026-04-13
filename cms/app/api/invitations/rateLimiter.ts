import { getRedisClient } from '@/src/utils/redisClient';
import { recordAuthProtectionTelemetry } from '../_lib/authProtectionTelemetry';
import {
  buildFailClosedRateLimit,
  evaluateInMemoryRateLimit,
  evaluateRedisRateLimit,
  type RateLimitEntry,
} from '../_lib/authRateLimiter';

export type InviteRateLimitResult = {
  limited: boolean;
  retryAtIso: string;
  remaining: number;
  degraded?: {
    mode: 'fail_closed' | 'emergency';
    reason: 'redis_unavailable';
  };
};

export const INVITE_RATE_LIMIT_MAX =
  Number.parseInt(process.env.INVITE_RATE_LIMIT_MAX ?? '', 10) || 3;

export const INVITE_RATE_LIMIT_WINDOW_MS =
  Number.parseInt(process.env.INVITE_RATE_LIMIT_WINDOW_MS ?? '', 10) ||
  15 * 60 * 1000;

const RATE_LIMIT_KEY_PREFIX = 'invites:limit:';

const fallbackState = new Map<string, RateLimitEntry>();

const resolveDegradedMode = (): 'fail_closed' | 'emergency' =>
  process.env.INVITE_RATE_LIMIT_DEGRADED_MODE?.trim().toLowerCase() === 'emergency'
    ? 'emergency'
    : 'fail_closed';

const resolveEmergencyMax = (max: number): number => {
  const parsed = Number.parseInt(process.env.INVITE_RATE_LIMIT_EMERGENCY_MAX ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(max, 1);
  return Math.max(1, Math.min(max, parsed));
};

const resolveEmergencyWindowMs = (windowMs: number): number => {
  const parsed = Number.parseInt(process.env.INVITE_RATE_LIMIT_EMERGENCY_WINDOW_MS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.min(windowMs, 5 * 60 * 1000);
  }
  return Math.max(60_000, Math.min(windowMs, parsed));
};

const buildRedisKey = (key: string) => `${RATE_LIMIT_KEY_PREFIX}${key}`;

export const resetInviteRateLimitState = async (key?: string) => {
  fallbackState.clear();
  if (!key) return;
  try {
    await getRedisClient().del(buildRedisKey(key));
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[invites] Failed to reset Redis rate limit key', { err: error });
    }
  }
};

export const evaluateInviteRateLimit = async (
  key: string,
): Promise<InviteRateLimitResult> => {
  const max = Math.max(1, INVITE_RATE_LIMIT_MAX);
  const windowMs = Math.max(60_000, INVITE_RATE_LIMIT_WINDOW_MS);
  const redisKey = buildRedisKey(key);

  try {
    return await evaluateRedisRateLimit(getRedisClient(), redisKey, max, windowMs);
  } catch (error) {
    const degradedMode = resolveDegradedMode();
    recordAuthProtectionTelemetry({
      scope: 'invites',
      event: 'redis_unavailable',
      mode: degradedMode,
      error,
    });

    if (degradedMode === 'emergency') {
      const emergencyMax = resolveEmergencyMax(max);
      const emergencyWindowMs = resolveEmergencyWindowMs(windowMs);
      const emergencyResult = evaluateInMemoryRateLimit(
        fallbackState,
        key,
        emergencyMax,
        emergencyWindowMs,
      );
      recordAuthProtectionTelemetry({
        scope: 'invites',
        event: emergencyResult.limited ? 'degraded_block' : 'degraded_allow',
        mode: 'emergency',
      });
      return {
        ...emergencyResult,
        degraded: {
          mode: 'emergency',
          reason: 'redis_unavailable',
        },
      };
    }

    recordAuthProtectionTelemetry({
      scope: 'invites',
      event: 'degraded_block',
      mode: 'fail_closed',
    });
    return {
      ...buildFailClosedRateLimit(windowMs),
      degraded: {
        mode: 'fail_closed',
        reason: 'redis_unavailable',
      },
    };
  }
};
