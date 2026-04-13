import { describe, expect, it, vi } from 'vitest';

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>,
) => {
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  vi.resetModules();
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    vi.resetModules();
  }
};

const makeUser = (overrides: Record<string, unknown> = {}): any => ({
  id: 42,
  role: 'captain',
  profileSlug: 'captain',
  callSign: 'Captain',
  pronouns: null,
  avatar: null,
  avatarUrl: null,
  bio: null,
  skills: [],
  links: [],
  honorBadges: [],
  createdAt: '2026-03-30T00:00:00.000Z',
  updatedAt: '2026-03-30T00:00:00.000Z',
  ...overrides,
});

describe('sanitizePublicProfile avatar precedence', () => {
  it('prefers uploaded avatar relation over legacy avatarUrl when both are present', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
      },
      async () => {
        const { sanitizePublicProfile } = await import('./sanitize');
        const profile = sanitizePublicProfile(
          makeUser({
            avatar: {
              filename: 'canonical.webp',
            },
            avatarUrl: '/media/avatars/legacy.jpg',
          }),
          {
            payload: {
              config: {
                serverURL: 'https://cms.astralpirates.com',
              },
            } as any,
          },
        );

        expect(profile.avatarUrl).toBe('https://cms.astralpirates.com/api/avatars/file/canonical.webp');
        expect(profile.avatarMediaUrl).toBe('https://cms.astralpirates.com/api/avatars/file/canonical.webp');
        expect(profile.avatarMediaType).toBe('image');
        expect(profile.avatarMimeType).toBe('image/webp');
        expect(profile.avatarFilename).toBe('canonical.webp');
      },
    );
  });

  it('uses avatarUrl when no uploaded avatar relation exists', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
      },
      async () => {
        const { sanitizePublicProfile } = await import('./sanitize');
        const profile = sanitizePublicProfile(
          makeUser({
            avatar: null,
            avatarUrl: '/media/avatars/legacy.jpg',
          }),
          {
            payload: {
              config: {
                serverURL: 'https://cms.astralpirates.com',
              },
            } as any,
          },
        );

        expect(profile.avatarUrl).toBe('https://cms.astralpirates.com/api/avatars/file/legacy.jpg');
        expect(profile.avatarMediaUrl).toBe('https://cms.astralpirates.com/api/avatars/file/legacy.jpg');
        expect(profile.avatarMediaType).toBe('image');
        expect(profile.avatarMimeType).toBe('image/jpeg');
        expect(profile.avatarFilename).toBe('legacy.jpg');
      },
    );
  });

  it('infers non-image avatar media type from external URL extension', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
      },
      async () => {
        const { sanitizePublicProfile } = await import('./sanitize');
        const profile = sanitizePublicProfile(
          makeUser({
            avatar: null,
            avatarMediaType: 'image',
            avatarUrl: 'https://cdn.example.com/avatar-video.mp4',
          }),
          {
            payload: {
              config: {
                serverURL: 'https://cms.astralpirates.com',
              },
            } as any,
          },
        );

        expect(profile.avatarUrl).toBe('https://cdn.example.com/avatar-video.mp4');
        expect(profile.avatarMediaUrl).toBe('https://cdn.example.com/avatar-video.mp4');
        expect(profile.avatarMediaType).toBe('video');
        expect(profile.avatarMimeType).toBe('video/mp4');
        expect(profile.avatarFilename).toBe('avatar-video.mp4');
      },
    );
  });
});

describe('sanitizePublicProfile honor badge media precedence', () => {
  it('prefers upload-backed media metadata when badge media map is provided', async () => {
    const { sanitizePublicProfile } = await import('./sanitize');
    const profile = sanitizePublicProfile(
      makeUser({
        honorBadges: [
          {
            code: 'pioneer',
            awardedAt: '2026-03-30T00:00:00.000Z',
            source: 'automatic',
            note: null,
          },
        ],
      }),
      {
        honorBadgeMediaByCode: new Map([
          [
            'pioneer',
            {
              iconMediaUrl: '/api/honor-badge-media/file/pioneer.mp4',
              iconMimeType: 'video/mp4',
              iconFilename: 'pioneer.mp4',
            },
          ],
        ]),
      },
    );

    expect(profile.honorBadges).toHaveLength(1);
    expect(profile.honorBadges[0]).toMatchObject({
      code: 'pioneer',
      iconUrl: '/api/honor-badge-media/file/pioneer.mp4',
      iconMediaUrl: '/api/honor-badge-media/file/pioneer.mp4',
      iconMimeType: 'video/mp4',
      iconFilename: 'pioneer.mp4',
    });
  });

  it('falls back to static icon metadata when upload-backed media is unavailable', async () => {
    const { sanitizePublicProfile } = await import('./sanitize');
    const profile = sanitizePublicProfile(
      makeUser({
        honorBadges: [
          {
            code: 'pioneer',
            awardedAt: '2026-03-30T00:00:00.000Z',
            source: 'automatic',
            note: null,
          },
        ],
      }),
    );

    expect(profile.honorBadges).toHaveLength(1);
    expect(profile.honorBadges[0]).toMatchObject({
      code: 'pioneer',
      iconUrl: '/images/badges/pioneer.svg',
      iconMediaUrl: null,
      iconMimeType: null,
      iconFilename: 'pioneer.svg',
    });
  });
});

describe('resolveHonorBadgeMediaByCode', () => {
  it('normalizes upload docs to honor-badge proxy URLs', async () => {
    const payload = {
      config: {
        serverURL: 'https://cms.astralpirates.com',
      },
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            badgeCode: 'pioneer',
            filename: 'pioneer.mp4',
            url: '/media/badges/pioneer.mp4',
            mimeType: 'video/mp4',
          },
        ],
      }),
    };

    const { resolveHonorBadgeMediaByCode } = await import('./sanitize');
    const mediaByCode = await resolveHonorBadgeMediaByCode({
      payload: payload as any,
      users: [
        makeUser({
          honorBadges: [
            {
              code: 'pioneer',
              awardedAt: '2026-03-30T00:00:00.000Z',
              source: 'automatic',
              note: null,
            },
          ],
        }),
      ],
    });

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'honor-badge-media',
      }),
    );
    expect(mediaByCode.get('pioneer')).toMatchObject({
      iconMediaUrl: 'https://cms.astralpirates.com/api/honor-badge-media/file/pioneer.mp4',
      iconMimeType: 'video/mp4',
      iconFilename: 'pioneer.mp4',
    });
  });
});

describe('sanitizePrivateProfile admin mode preferences', () => {
  it('keeps quartermaster preferences read-only even if edit preference is set', async () => {
    const { sanitizePrivateProfile } = await import('./sanitize');
    const profile = sanitizePrivateProfile(
      makeUser({
        role: 'quartermaster',
        adminModeViewPreference: true,
        adminModeEditPreference: true,
        email: 'crew@astralpirates.com',
        firstName: 'Ra',
        lastName: 'Moon',
      }),
    );

    expect(profile.adminModePreferences).toEqual({
      adminViewEnabled: true,
      adminEditEnabled: false,
    });
  });

  it('forces both preferences off for ineligible roles', async () => {
    const { sanitizePrivateProfile } = await import('./sanitize');
    const profile = sanitizePrivateProfile(
      makeUser({
        role: 'seamen',
        adminModeViewPreference: true,
        adminModeEditPreference: true,
        email: 'crew@astralpirates.com',
        firstName: 'Ra',
        lastName: 'Moon',
      }),
    );

    expect(profile.adminModePreferences).toEqual({
      adminViewEnabled: false,
      adminEditEnabled: false,
    });
  });
});
