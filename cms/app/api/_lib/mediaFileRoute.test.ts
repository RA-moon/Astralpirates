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

describe('isLocalReadFallbackEnabledForClass', () => {
  it('defaults to enabled when no fallback env vars are set', async () => {
    await withEnv(
      {
        MEDIA_LOCAL_READ_FALLBACK_ENABLED: undefined,
        MEDIA_AVATAR_LOCAL_READ_FALLBACK_ENABLED: undefined,
      },
      async () => {
        const mediaRoute = await import('./mediaFileRoute');
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('avatars')).toBe(true);
      },
    );
  });

  it('respects global fallback disable flag', async () => {
    await withEnv(
      {
        MEDIA_LOCAL_READ_FALLBACK_ENABLED: 'false',
        MEDIA_AVATAR_LOCAL_READ_FALLBACK_ENABLED: undefined,
      },
      async () => {
        const mediaRoute = await import('./mediaFileRoute');
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('avatars')).toBe(false);
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('gallery')).toBe(false);
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('badges')).toBe(false);
      },
    );
  });

  it('allows class-specific enable override', async () => {
    await withEnv(
      {
        MEDIA_LOCAL_READ_FALLBACK_ENABLED: 'false',
        MEDIA_AVATAR_LOCAL_READ_FALLBACK_ENABLED: 'true',
      },
      async () => {
        const mediaRoute = await import('./mediaFileRoute');
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('avatars')).toBe(true);
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('tasks')).toBe(false);
      },
    );
  });

  it('allows class-specific disable override', async () => {
    await withEnv(
      {
        MEDIA_LOCAL_READ_FALLBACK_ENABLED: 'true',
        MEDIA_AVATAR_LOCAL_READ_FALLBACK_ENABLED: 'false',
      },
      async () => {
        const mediaRoute = await import('./mediaFileRoute');
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('avatars')).toBe(false);
        expect(mediaRoute.isLocalReadFallbackEnabledForClass('gallery')).toBe(true);
      },
    );
  });
});
