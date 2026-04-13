import type { NextRequest } from 'next/server';

const parseForwardedHeader = (value: string | null): string | null => {
  if (!value) return null;
  const segments = value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments[0] : null;
};

export const resolveClientFingerprint = (req: NextRequest): string => {
  const forwarded = parseForwardedHeader(req.headers.get('x-forwarded-for'));
  if (forwarded) return forwarded;

  const realIp =
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-client-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return 'unknown';
};
