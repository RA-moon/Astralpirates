import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  getPayloadInstanceMock,
  findActiveRedirectMock,
  disableRedirectMock,
  sanitizePublicProfileMock,
  resolveHonorBadgeMediaByCodeMock,
} = vi.hoisted(() => ({
  getPayloadInstanceMock: vi.fn(),
  findActiveRedirectMock: vi.fn(),
  disableRedirectMock: vi.fn(),
  sanitizePublicProfileMock: vi.fn((profile: any) => ({ ...profile, sanitized: true })),
  resolveHonorBadgeMediaByCodeMock: vi.fn(async () => new Map()),
}));

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: getPayloadInstanceMock,
}));

vi.mock('@/app/api/profiles/_lib/sanitize', () => ({
  sanitizePublicProfile: sanitizePublicProfileMock,
  resolveHonorBadgeMediaByCode: resolveHonorBadgeMediaByCodeMock,
}));

vi.mock('@/src/services/profileSlugRedirects', async () => {
  const actual = await vi.importActual<typeof import('@/src/services/profileSlugRedirects')>(
    '@/src/services/profileSlugRedirects',
  );
  return {
    ...actual,
    findActiveRedirect: findActiveRedirectMock,
    disableRedirect: disableRedirectMock,
  };
});

import { GET } from '@/app/api/profiles/[slug]/route';

const makeRequest = () =>
  ({
    headers: new Headers(),
  }) as unknown as NextRequest;

const createPayload = () => ({
  find: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
});

const sanitizeProfile = (id: number, profileSlug: string) => ({
  id,
  role: 'captain',
  profileSlug,
  callSign: 'Captain',
  pronouns: null,
  bio: null,
  avatarUrl: null,
  avatarMediaType: 'image',
  avatarMediaUrl: null,
  avatarMimeType: null,
  avatarFilename: null,
  createdAt: '2026-03-30T00:00:00.000Z',
  updatedAt: '2026-03-30T00:00:00.000Z',
});

describe('GET /api/profiles/:slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a profile when slug exists directly', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [
        sanitizeProfile(11, 'captain-old'),
      ],
    });
    getPayloadInstanceMock.mockResolvedValue(payload);

    const response = await GET(makeRequest(), { params: { slug: 'captain-old' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.profileSlug).toBe('captain-old');
    expect(body.redirectTo).toBeUndefined();
    expect(payload.find).toHaveBeenCalledTimes(1);
    expect(sanitizePublicProfileMock).toHaveBeenCalledTimes(1);
  });

  it('returns the resolved canonical profile and redirectTo for old slugs', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [sanitizeProfile(11, 'captain-new')],
      });

    getPayloadInstanceMock.mockResolvedValue(payload);
    findActiveRedirectMock
      .mockResolvedValueOnce({
        fromSlug: 'captain-old',
        toSlug: 'captain-new',
        targetUserId: 11,
        reason: 'profile-rename',
        createdAt: '2026-03-30T00:00:00.000Z',
        disabledAt: null,
      })
      .mockResolvedValueOnce(undefined);

    const response = await GET(makeRequest(), { params: { slug: 'Captain-Old' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Astral-Redirect')).toBe('captain-new');
    expect(body).toMatchObject({
      profile: {
        id: 11,
        profileSlug: 'captain-new',
      },
      redirectTo: {
        profileSlug: 'captain-new',
      },
    });
    expect(findActiveRedirectMock).toHaveBeenCalledWith({
      payload,
      fromSlug: 'captain-old',
    });
    expect(disableRedirectMock).not.toHaveBeenCalled();
  });

  it('returns 404 and disables stale redirect when canonical profile is missing', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    getPayloadInstanceMock.mockResolvedValue(payload);
    findActiveRedirectMock
      .mockResolvedValueOnce({
        fromSlug: 'captain-old',
        toSlug: 'captain-new',
        targetUserId: 11,
        reason: 'profile-rename',
        createdAt: '2026-03-30T00:00:00.000Z',
        disabledAt: null,
      })
      .mockResolvedValueOnce({
        fromSlug: 'captain-new',
        toSlug: 'captain-old',
        targetUserId: 11,
        reason: 'profile-rename',
        createdAt: '2026-03-30T00:00:00.000Z',
        disabledAt: null,
      });

    const response = await GET(makeRequest(), { params: { slug: 'captain-old' } });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Profile not found.');
    expect(disableRedirectMock).toHaveBeenCalledWith({ payload, fromSlug: 'captain-old' });
  });

  it('returns 400 for invalid slug', async () => {
    const payload = createPayload();
    getPayloadInstanceMock.mockResolvedValue(payload);

    const response = await GET(makeRequest(), { params: { slug: 'bad slug' } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid profile slug.');
    expect(payload.find).not.toHaveBeenCalled();
  });
});
