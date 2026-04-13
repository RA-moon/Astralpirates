import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ADMIN_MODE_HEADERS } from '@astralpirates/shared/adminMode';

const FALLBACK_ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://frontend:3001',
  'http://astralpirates-frontend:3001',
  'https://astralpirates.com',
  'https://www.astralpirates.com',
];

// Always include the known production domains even when PAYLOAD_PUBLIC_CORS_ORIGIN is set
// so misconfigured envs don't accidentally drop the live site from the allowlist.
const DEFAULT_ALLOWED_ORIGINS = [
  ...FALLBACK_ALLOWED_ORIGINS,
  ...(process.env.PAYLOAD_PUBLIC_CORS_ORIGIN
    ? process.env.PAYLOAD_PUBLIC_CORS_ORIGIN.split(',')
    : []),
].join(',');

const DEV_FALLBACK_ORIGINS = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://0.0.0.0:*',
  'https://localhost:*',
];

const sanitizeOrigins = (raw: string): string[] =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const buildAllowedOrigins = (): string[] => {
  const base = sanitizeOrigins(DEFAULT_ALLOWED_ORIGINS);
  const configuredOrigins = [
    process.env.FRONTEND_ORIGIN,
    process.env.PAYLOAD_PUBLIC_SERVER_URL,
    process.env.ASTRAL_API_BASE,
    process.env.NUXT_PUBLIC_ASTRAL_API_BASE,
    process.env.PAYLOAD_PUBLIC_SITE_URL,
    process.env.PAYLOAD_PUBLIC_FRONTEND_URL,
    process.env.SITE_ORIGIN,
    process.env.CLIENT_ORIGIN,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  base.push(...configuredOrigins);
  if (process.env.NODE_ENV !== 'production') {
    base.push(...DEV_FALLBACK_ORIGINS);
  }
  return Array.from(new Set(base));
};

const allowedOrigins = buildAllowedOrigins();
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'If-Match',
  'X-Idempotency-Key',
  'X-Editor-Session-Id',
  ADMIN_MODE_HEADERS.view,
  ADMIN_MODE_HEADERS.edit,
].join(', ');
const BLOCKED_CORS_ORIGIN = 'null';

const matchesOrigin = (origin: string, allowed: string): boolean => {
  if (allowed === '*') return true;
  if (allowed.includes('*')) {
    const escaped = allowed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`);
    return pattern.test(origin);
  }
  return allowed === origin;
};

type ResolvedOrigin = {
  origin: string;
  matched: boolean;
};

export const resolveOrigin = (requestOrigin: string | null | undefined): ResolvedOrigin => {
  if (requestOrigin) {
    const isAllowed = allowedOrigins.some((allowed) => matchesOrigin(requestOrigin, allowed));
    if (isAllowed) {
      return { origin: requestOrigin, matched: true };
    }

    return { origin: BLOCKED_CORS_ORIGIN, matched: false };
  }

  const fallback = allowedOrigins.find((origin) => origin !== '*');

  return {
    origin: fallback ?? requestOrigin ?? BLOCKED_CORS_ORIGIN,
    matched: false,
  };
};

export const applyCors = (
  response: NextResponse,
  methods: string,
  req?: NextRequest,
): NextResponse => {
  const requestOrigin = req?.headers.get('Origin') ?? null;
  const { origin, matched } = resolveOrigin(requestOrigin);

  if (!matched && requestOrigin) {
    console.warn(
      `[cors] Origin "${requestOrigin}" is not in the allowlist. Responding with "${origin}".`,
    );
    response.headers.set('X-CORS-Adjusted-Origin', 'true');
    response.headers.set('X-CORS-Blocked', 'true');
    response.headers.set('Access-Control-Allow-Origin', BLOCKED_CORS_ORIGIN);
    response.headers.set('Access-Control-Allow-Credentials', 'false');
    response.headers.set('Access-Control-Allow-Methods', methods);
    response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    response.headers.append('Vary', 'Origin');
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', methods);
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  response.headers.append('Vary', 'Origin');
  return response;
};

export const corsJson = <T>(
  req: NextRequest,
  data: T,
  init: ResponseInit & { status?: number } = {},
  methods = 'OPTIONS,GET,POST',
) => {
  const response = NextResponse.json(data, init);
  return applyCors(response, methods, req);
};

export const corsEmpty = (req: NextRequest, methods = 'OPTIONS,GET,POST', status = 204) => {
  const response = new NextResponse(null, { status });
  return applyCors(response, methods, req);
};
