import { getRedisClient } from '@/src/utils/redisClient';
import { recordAuthProtectionTelemetry } from '../_lib/authProtectionTelemetry';
import {
  buildFailClosedRateLimit,
  evaluateInMemoryRateLimit,
  evaluateRedisRateLimit,
  type RateLimitEntry,
} from '../_lib/authRateLimiter';

export type RateLimitResult = {
  limited: boolean;
  retryAtIso: string;
  remaining: number;
  degraded?: {
    mode: 'fail_closed' | 'emergency';
    reason: 'redis_unavailable';
  };
};

const PER_USER_MAX =
  Number.parseInt(process.env.PASSWORD_RESET_PER_USER_MAX ?? '', 10) || 3;
const PER_USER_WINDOW_MS =
  Number.parseInt(process.env.PASSWORD_RESET_PER_USER_WINDOW_MS ?? '', 10) ||
  24 * 60 * 60 * 1000;

const PER_IP_MAX = Number.parseInt(process.env.PASSWORD_RESET_PER_IP_MAX ?? '', 10) || 10;
const PER_IP_WINDOW_MS =
  Number.parseInt(process.env.PASSWORD_RESET_PER_IP_WINDOW_MS ?? '', 10) ||
  15 * 60 * 1000;

const KEY_PREFIX = 'password_resets:limit:';
const fallbackState = new Map<string, RateLimitEntry>();

const resolveDegradedMode = (): 'fail_closed' | 'emergency' =>
  process.env.PASSWORD_RESET_RATE_LIMIT_DEGRADED_MODE?.trim().toLowerCase() === 'emergency'
    ? 'emergency'
    : 'fail_closed';

const resolveEmergencyMax = (max: number): number => {
  const parsed = Number.parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_EMERGENCY_MAX ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(max, 1);
  return Math.max(1, Math.min(max, parsed));
};

const resolveEmergencyWindowMs = (windowMs: number): number => {
  const parsed = Number.parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_EMERGENCY_WINDOW_MS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.min(windowMs, 5 * 60 * 1000);
  }
  return Math.max(60_000, Math.min(windowMs, parsed));
};

const buildKey = (scope: string, identifier: string) => `${KEY_PREFIX}${scope}:${identifier}`;

const evaluateRateLimit = async (
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> => {
  const redisKey = buildKey('rl', key);

  try {
    return await evaluateRedisRateLimit(getRedisClient(), redisKey, max, windowMs);
  } catch (error) {
    const degradedMode = resolveDegradedMode();
    recordAuthProtectionTelemetry({
      scope: 'password_resets',
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
        scope: 'password_resets',
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
      scope: 'password_resets',
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

export const evaluateUserRateLimit = (identifier: string) =>
  evaluateRateLimit(`user:${identifier}`, Math.max(1, PER_USER_MAX), Math.max(60_000, PER_USER_WINDOW_MS));

export const evaluateIpRateLimit = (identifier: string) =>
  evaluateRateLimit(`ip:${identifier}`, Math.max(1, PER_IP_MAX), Math.max(60_000, PER_IP_WINDOW_MS));

export const resetPasswordResetRateLimit = async (key?: string) => {
  fallbackState.clear();
  if (!key) return;
  try {
    await getRedisClient().del(buildKey('rl', key));
  } catch {
    // ignore
  }
};
