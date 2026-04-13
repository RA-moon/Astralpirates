export type RateLimitEntry = {
  count: number;
  resetAt: number;
  lastAttempt: number;
};

export type RateLimitResult = {
  limited: boolean;
  retryAtIso: string;
  remaining: number;
};

type RedisLike = {
  incr: (key: string) => Promise<number>;
  pttl: (key: string) => Promise<number>;
  pexpire: (key: string, ttlMs: number) => Promise<unknown>;
};

export const evaluateInMemoryRateLimit = (
  state: Map<string, RateLimitEntry>,
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult => {
  const now = Date.now();
  let entry = state.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
      lastAttempt: now,
    };
  }
  if (entry.count >= max) {
    state.set(key, entry);
    return {
      limited: true,
      retryAtIso: new Date(entry.resetAt).toISOString(),
      remaining: 0,
    };
  }
  entry.count += 1;
  entry.lastAttempt = now;
  state.set(key, entry);
  return {
    limited: false,
    retryAtIso: new Date(entry.resetAt).toISOString(),
    remaining: Math.max(0, max - entry.count),
  };
};

export const evaluateRedisRateLimit = async (
  redis: RedisLike,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> => {
  const count = await redis.incr(key);
  let ttlMs = await redis.pttl(key);
  if (ttlMs < 0) {
    await redis.pexpire(key, windowMs);
    ttlMs = windowMs;
  }
  return {
    limited: count > max,
    retryAtIso: new Date(Date.now() + ttlMs).toISOString(),
    remaining: Math.max(0, max - count),
  };
};

export const buildFailClosedRateLimit = (windowMs: number): RateLimitResult => ({
  limited: true,
  retryAtIso: new Date(Date.now() + windowMs).toISOString(),
  remaining: 0,
});
