import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { corsEmpty, corsJson } from '../_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET,POST';
const DEFAULT_COOKIE_NAME = 'astral_client_event';
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 60;

type ClientEventPayload = {
  message?: string;
  component?: string;
  stack?: string;
  level?: 'error' | 'warn';
  meta?: Record<string, unknown>;
  url?: string;
  userAgent?: string;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

const rateLimiter = new Map<string, RateLimitState>();

const parsePositiveInt = (rawValue: string | undefined, fallback: number): number => {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const config = {
  secret: process.env.CLIENT_EVENT_SECRET?.trim() || process.env.PAYLOAD_SECRET?.trim() || '',
  cookieName: process.env.CLIENT_EVENT_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
  rateLimitWindowMs: parsePositiveInt(
    process.env.CLIENT_EVENT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
  ),
  rateLimitMax: parsePositiveInt(process.env.CLIENT_EVENT_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
};

const signToken = (token: string): string =>
  createHmac('sha256', config.secret).update(token).digest('hex');

const issueSignedToken = (): string => {
  const token = randomBytes(16).toString('hex');
  return `${token}.${signToken(token)}`;
};

const verifySignedToken = (value: string): string | null => {
  const [token, signature] = value.split('.');
  if (!token || !signature || !config.secret) return null;
  const expected = signToken(token);
  if (expected.length !== signature.length) return null;
  try {
    if (timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
      return token;
    }
  } catch {
    return null;
  }
  return null;
};

const setClientEventCookie = (req: NextRequest, response: NextResponse) => {
  const secure = req.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production';
  const value = issueSignedToken();
  response.cookies.set({
    name: config.cookieName,
    value,
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: DEFAULT_COOKIE_MAX_AGE_SECONDS,
  });
};

const getClientIp = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const [first] = forwarded
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();
  return 'unknown';
};

const consumeRateLimit = (key: string): { limited: boolean; retryAfterMs: number } => {
  const now = Date.now();
  const existing = rateLimiter.get(key);
  if (!existing || existing.resetAt <= now) {
    if (existing) {
      rateLimiter.delete(key);
    }
    rateLimiter.set(key, {
      count: 1,
      resetAt: now + config.rateLimitWindowMs,
    });
    return { limited: false, retryAfterMs: config.rateLimitWindowMs };
  }
  if (existing.count >= config.rateLimitMax) {
    return { limited: true, retryAfterMs: Math.max(1, existing.resetAt - now) };
  }
  existing.count += 1;
  return { limited: false, retryAfterMs: Math.max(1, existing.resetAt - now) };
};

const parseClientEventPayload = async (req: NextRequest): Promise<ClientEventPayload | null> => {
  try {
    return (await req.json()) as ClientEventPayload;
  } catch {
    return null;
  }
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const normalizeMeta = (value: unknown): Record<string, unknown> | null => {
  const record = asObject(value);
  if (!record) return null;
  return record;
};

const logClientEvent = (req: NextRequest, payload: ClientEventPayload, ip: string) => {
  const message = payload.message?.trim() ?? '';
  const entry = {
    message,
    component: payload.component ?? 'unknown',
    stack: payload.stack ?? null,
    level: payload.level === 'warn' ? 'warn' : 'error',
    meta: normalizeMeta(payload.meta),
    url: payload.url ?? null,
    userAgent: payload.userAgent ?? req.headers.get('user-agent') ?? null,
    ip,
  };
  if (entry.level === 'warn') {
    console.warn('[client-event]', entry);
    return;
  }
  console.error('[client-event]', entry);
};

const ensureSecretConfigured = (req: NextRequest): NextResponse | null => {
  if (config.secret) {
    return null;
  }
  return corsJson(req, { error: 'Client-event logging unavailable.' }, { status: 503 }, METHODS);
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function GET(req: NextRequest) {
  const secretError = ensureSecretConfigured(req);
  if (secretError) return secretError;

  const response = corsEmpty(req, METHODS);
  const cookieValue = req.cookies.get(config.cookieName)?.value;
  if (!cookieValue || !verifySignedToken(cookieValue)) {
    setClientEventCookie(req, response);
  }
  return response;
}

export async function POST(req: NextRequest) {
  const secretError = ensureSecretConfigured(req);
  if (secretError) return secretError;

  const payload = await parseClientEventPayload(req);
  const message = payload?.message?.trim() ?? '';
  if (!message) {
    return corsJson(req, { error: 'Client event message is required.' }, { status: 400 }, METHODS);
  }

  const cookieValue = req.cookies.get(config.cookieName)?.value;
  const token = cookieValue ? verifySignedToken(cookieValue) : null;
  if (!token) {
    const response = corsJson(req, { error: 'Missing client-event token.' }, { status: 403 }, METHODS);
    setClientEventCookie(req, response);
    return response;
  }

  const ip = getClientIp(req);
  const rateKey = `${token}:${ip}`;
  const { limited, retryAfterMs } = consumeRateLimit(rateKey);
  if (limited) {
    const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const response = corsJson(
      req,
      { error: 'Too many client-event requests.' },
      { status: 429 },
      METHODS,
    );
    response.headers.set('Retry-After', String(retrySeconds));
    return response;
  }

  logClientEvent(req, payload as ClientEventPayload, ip);
  return corsJson(req, { ok: true }, { status: 200 }, METHODS);
}
