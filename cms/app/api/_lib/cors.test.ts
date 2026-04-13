import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const makeRequest = (origin?: string) =>
  ({
    headers: origin ? new Headers({ Origin: origin }) : new Headers(),
  }) as unknown as NextRequest;

describe('CORS helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats FRONTEND_ORIGIN as an allowed origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FRONTEND_ORIGIN', 'https://astralpirates.example');
    vi.stubEnv('PAYLOAD_PUBLIC_CORS_ORIGIN', 'http://localhost:8080');

    const { resolveOrigin } = await import('./cors');
    const result = resolveOrigin('https://astralpirates.example');

    expect(result).toEqual({
      origin: 'https://astralpirates.example',
      matched: true,
    });
  });

  it('blocks unmatched request origins for credentialed flows', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FRONTEND_ORIGIN', 'https://astralpirates.com');

    const { corsJson } = await import('./cors');
    const response = corsJson(makeRequest('https://evil.example'), { ok: true });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('null');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('false');
    expect(response.headers.get('X-CORS-Blocked')).toBe('true');
  });

  it('preserves allowlisted origins', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FRONTEND_ORIGIN', 'https://astralpirates.com');

    const { corsJson } = await import('./cors');
    const response = corsJson(makeRequest('https://astralpirates.com'), { ok: true });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://astralpirates.com');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('X-CORS-Blocked')).toBeNull();
  });
});
