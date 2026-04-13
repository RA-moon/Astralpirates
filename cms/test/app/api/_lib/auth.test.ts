import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getPayloadInstanceMock } = vi.hoisted(() => ({
  getPayloadInstanceMock: vi.fn(),
}));

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: getPayloadInstanceMock,
}));

import { authenticateRequest, resolveAdminModeRequestInputs } from '@/app/api/_lib/auth';

const makeRequest = (headers: HeadersInit = {}) =>
  ({
    headers: new Headers(headers),
    nextUrl: new URL('https://astralpirates.com/api/test'),
  }) as any;

const makePayload = () => ({
  auth: vi.fn(),
  findByID: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
});

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries with cookie-only auth when bearer auth fails', async () => {
    const payload = makePayload();
    payload.auth
      .mockResolvedValueOnce({ user: null })
      .mockResolvedValueOnce({ user: { id: 7 } });
    payload.findByID.mockResolvedValue({ id: 7, email: 'captain@example.com' });
    getPayloadInstanceMock.mockResolvedValue(payload);

    const result = await authenticateRequest(
      makeRequest({
        Authorization: 'Bearer stale-token',
        Cookie: 'payload-token=fresh-cookie-token',
      }),
    );

    expect(payload.auth).toHaveBeenCalledTimes(2);
    const firstHeaders = payload.auth.mock.calls[0]?.[0]?.headers as Headers;
    const secondHeaders = payload.auth.mock.calls[1]?.[0]?.headers as Headers;
    expect(firstHeaders.get('Authorization')).toBe('JWT stale-token');
    expect(secondHeaders.get('Authorization')).toBeNull();
    expect(secondHeaders.get('Cookie')).toContain('payload-token=');
    expect(result.user?.id).toBe(7);
  });

  it('returns unauthenticated context when auth has no user and no cookie fallback is possible', async () => {
    const payload = makePayload();
    payload.auth.mockResolvedValue({ user: null });
    getPayloadInstanceMock.mockResolvedValue(payload);

    const result = await authenticateRequest(makeRequest({ Authorization: 'Bearer stale-token' }));

    expect(payload.auth).toHaveBeenCalledTimes(1);
    expect(result.user).toBeNull();
  });

  it('falls back to cookie auth when bearer auth throws', async () => {
    const payload = makePayload();
    payload.auth
      .mockRejectedValueOnce(new Error('jwt expired'))
      .mockResolvedValueOnce({ user: { id: 11 } });
    payload.findByID.mockResolvedValue({ id: 11, email: 'crew@example.com' });
    getPayloadInstanceMock.mockResolvedValue(payload);

    const result = await authenticateRequest(
      makeRequest({
        Authorization: 'Bearer expired-token',
        Cookie: 'payload-token=fresh-cookie-token',
      }),
    );

    expect(payload.auth).toHaveBeenCalledTimes(2);
    const secondHeaders = payload.auth.mock.calls[1]?.[0]?.headers as Headers;
    expect(secondHeaders.get('Authorization')).toBeNull();
    expect(secondHeaders.get('Cookie')).toContain('payload-token=');
    expect(result.user?.id).toBe(11);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/test' }),
      '[auth] bearer auth failed before cookie fallback',
    );
  });
});

describe('resolveAdminModeRequestInputs', () => {
  it('falls back to persisted preferences when request signals are missing', () => {
    expect(
      resolveAdminModeRequestInputs({
        requestedAdminViewSignal: null,
        requestedAdminEditSignal: null,
        persistedPreferenceMode: {
          adminViewEnabled: true,
          adminEditEnabled: false,
        },
      }),
    ).toEqual({
      adminViewRequested: true,
      adminEditRequested: false,
    });
  });

  it('prefers explicit request signals over persisted preferences', () => {
    expect(
      resolveAdminModeRequestInputs({
        requestedAdminViewSignal: '0',
        requestedAdminEditSignal: '1',
        persistedPreferenceMode: {
          adminViewEnabled: true,
          adminEditEnabled: false,
        },
      }),
    ).toEqual({
      adminViewRequested: '0',
      adminEditRequested: '1',
    });
  });
});
