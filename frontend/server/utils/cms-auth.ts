import type { H3Event } from 'h3';
import { getHeader, parseCookies } from 'h3';

const DEFAULT_AUTH_COOKIE_NAMES = new Set(['payload-token', 'astralpirates-session']);

export const hasCmsAuth = (
  event: H3Event,
  cookieNames: Set<string> = DEFAULT_AUTH_COOKIE_NAMES,
) => {
  const headers = resolveCmsAuthHeaders(event, cookieNames);
  return Boolean(headers.authorization) || Boolean(headers.cookie);
};

export const resolveCmsAuthHeaders = (
  event: H3Event,
  cookieNames: Set<string> = DEFAULT_AUTH_COOKIE_NAMES,
): Record<string, string> => {
  const headers: Record<string, string> = {};
  const authHeader = getHeader(event, 'authorization');
  if (authHeader && authHeader.trim().length > 0) {
    headers.authorization = authHeader;
  }

  const cookies = parseCookies(event);
  const filtered = Object.entries(cookies || {}).filter(([name]) => cookieNames.has(name));
  if (filtered.length > 0) {
    headers.cookie = filtered.map(([name, value]) => `${name}=${value}`).join('; ');
  }

  return headers;
};
