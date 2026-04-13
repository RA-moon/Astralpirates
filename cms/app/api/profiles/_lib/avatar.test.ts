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

describe('resolveAvatarUrl', () => {
  it('maps legacy media and api avatar paths to the avatar proxy route in seaweed mode', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        MEDIA_BUCKET_AVATARS: 'crew-avatars',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
      },
      async () => {
        const avatar = await import('./avatar');
        const payload = {
          config: {
            serverURL: 'https://cms.astralpirates.com',
          },
        } as any;

        expect(avatar.resolveAvatarUrlFromValue(payload, '/media/avatars/pilot.jpg')).toBe(
          'https://cms.astralpirates.com/api/avatars/file/pilot.jpg',
        );
        expect(avatar.resolveAvatarUrlFromValue(payload, '/api/avatars/file/pilot.jpg')).toBe(
          'https://cms.astralpirates.com/api/avatars/file/pilot.jpg',
        );
      },
    );
  });

  it('resolves upload filename fallback to the avatar proxy route in seaweed mode', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        MEDIA_BUCKET_AVATARS: 'crew-avatars',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
      },
      async () => {
        const avatar = await import('./avatar');
        const payload = {
          config: {
            serverURL: 'https://cms.astralpirates.com',
          },
        } as any;

        expect(
          avatar.resolveAvatarUrlFromUpload(payload, {
            filename: 'fallback.webp',
          }),
        ).toBe('https://cms.astralpirates.com/api/avatars/file/fallback.webp');
      },
    );
  });

  it('rewrites absolute legacy avatar URLs to the avatar proxy route', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        MEDIA_BUCKET_AVATARS: 'crew-avatars',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
        FRONTEND_ORIGIN: 'https://astralpirates.com',
      },
      async () => {
        const avatar = await import('./avatar');
        const payload = {
          config: {
            serverURL: 'https://cms.astralpirates.com',
          },
        } as any;

        expect(
          avatar.resolveAvatarUrlFromValue(
            payload,
            'https://astralpirates.com/media/avatars/legacy-user.jpg',
          ),
        ).toBe('https://cms.astralpirates.com/api/avatars/file/legacy-user.jpg');

        expect(
          avatar.resolveAvatarUrlFromValue(
            payload,
            'https://artifact.astralpirates.com/avatars/legacy-user.jpg',
          ),
        ).toBe('https://cms.astralpirates.com/api/avatars/file/legacy-user.jpg');

        expect(
          avatar.resolveAvatarUrlFromValue(
            null,
            'https://astralpirates.com/media/avatars/legacy-user.jpg',
          ),
        ).toBe('https://cms.astralpirates.com/api/avatars/file/legacy-user.jpg');
      },
    );
  });

  it('keeps external non-compat avatar URLs untouched', async () => {
    await withEnv(
      {
        MEDIA_STORAGE_PROVIDER: 'seaweedfs',
        MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
        MEDIA_BUCKET_AVATARS: 'crew-avatars',
        PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
        FRONTEND_ORIGIN: undefined,
      },
      async () => {
        const avatar = await import('./avatar');

        expect(
          avatar.resolveAvatarUrlFromValue(
            null,
            'https://example.com/assets/user-avatar.png',
          ),
        ).toBe('https://example.com/assets/user-avatar.png');
      },
    );
  });
});
