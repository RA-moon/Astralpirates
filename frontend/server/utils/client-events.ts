import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import {
  createError,
  getCookie,
  getRequestHeader,
  setCookie,
} from 'h3';
import { useRuntimeConfig } from '#imports';

type ClientEventConfig = {
  secret: string;
  cookieName: string;
  rateLimit: {
    windowMs: number;
    max: number;
  };
};

type RateState = {
  count: number;
  resetAt: number;
};

const rateLimiter = new Map<string, RateState>();
const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const parseConfig = (event: H3Event): ClientEventConfig => {
  const runtime = useRuntimeConfig(event);
  const secret = runtime.clientEvents?.secret ?? '';
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Client-event logging unavailable',
    });
  }

  const cookieName = runtime.clientEvents?.cookieName?.trim() || 'astral_client_event';
  const windowMs = runtime.clientEvents?.rateLimit?.windowMs ?? 60_000;
  const max = runtime.clientEvents?.rateLimit?.max ?? 60;

  return {
    secret,
    cookieName,
    rateLimit: {
      windowMs: windowMs > 0 ? windowMs : 60_000,
      max: max > 0 ? max : 60,
    },
  };
};

const signToken = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

const verifySignedToken = (value: string, secret: string): string | null => {
  const [token, signature] = value.split('.');
  if (!token || !signature) return null;
  const expected = signToken(token, secret);
  if (expected.length !== signature.length) {
    return null;
  }
  try {
    if (
      timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
    ) {
      return token;
    }
  } catch {
    return null;
  }
  return null;
};

const consumeRateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const existing = rateLimiter.get(key);
  if (!existing || existing.resetAt <= now) {
    if (existing) {
      rateLimiter.delete(key);
    }
    rateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, retryAfterMs: windowMs };
  }
  if (existing.count >= limit) {
    return { limited: true, remaining: 0, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return {
    limited: false,
    remaining: Math.max(0, limit - existing.count),
    retryAfterMs: existing.resetAt - now,
  };
};

const getClientIp = (event: H3Event): string => {
  const header = getRequestHeader(event, 'x-forwarded-for');
  if (header) {
    const [ip] = header.split(',').map((value) => value.trim()).filter(Boolean);
    if (ip) return ip;
  }
  return event.node.req.socket.remoteAddress ?? 'unknown';
};

export const ensureClientEventCookie = (event: H3Event) => {
  const runtime = useRuntimeConfig(event);
  const secret = runtime.clientEvents?.secret;
  if (!secret) return;

  const cookieName = runtime.clientEvents?.cookieName?.trim() || 'astral_client_event';
  const existing = getCookie(event, cookieName);
  if (existing && verifySignedToken(existing, secret)) {
    return;
  }

  const token = randomBytes(16).toString('hex');
  const value = `${token}.${signToken(token, secret)}`;
  const secure = process.env.NODE_ENV === 'production';
  setCookie(event, cookieName, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: DEFAULT_COOKIE_MAX_AGE,
  });
};

export const authorizeClientEventRequest = (event: H3Event) => {
  const config = parseConfig(event);
  const cookieValue = getCookie(event, config.cookieName);
  if (!cookieValue) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Missing client-event token',
    });
  }

  const token = verifySignedToken(cookieValue, config.secret);
  if (!token) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid client-event token',
    });
  }

  const ip = getClientIp(event);
  const rateKey = `${token}:${ip}`;
  const { limited, retryAfterMs } = consumeRateLimit(
    rateKey,
    config.rateLimit.max,
    config.rateLimit.windowMs,
  );

  if (limited) {
    const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    event.node.res.setHeader('Retry-After', String(retrySeconds));
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many client-event requests',
    });
  }

  return { ip };
};
