import { describe, expect, it } from 'vitest';

import {
  AVATAR_FALLBACK_IMAGE_URL,
  hasAvatarUrl,
  normalizeAvatarUrl,
  resolveAvatarDisplayUrl,
} from '~/modules/media/avatarUrls';

describe('avatarUrls', () => {
  it('normalizes known internal avatar paths', () => {
    expect(normalizeAvatarUrl('/media/avatars/Captain One.png')).toBe(
      '/api/avatars/file/Captain%20One.png',
    );
  });

  it('strips missing-media fallback query from avatar proxy URLs', () => {
    expect(normalizeAvatarUrl('/api/avatars/file/Captain%20One.png?fallback=image')).toBe(
      '/api/avatars/file/Captain%20One.png',
    );
  });

  it('keeps external avatar URLs', () => {
    expect(normalizeAvatarUrl('https://example.com/avatar.png')).toBe(
      'https://example.com/avatar.png',
    );
  });

  it('resolves fallback image when avatar URL is missing', () => {
    expect(resolveAvatarDisplayUrl(null)).toBe(AVATAR_FALLBACK_IMAGE_URL);
    expect(resolveAvatarDisplayUrl('')).toBe(AVATAR_FALLBACK_IMAGE_URL);
  });

  it('reports whether a custom avatar URL is present', () => {
    expect(hasAvatarUrl(null)).toBe(false);
    expect(hasAvatarUrl('')).toBe(false);
    expect(hasAvatarUrl('/api/avatars/file/captain.png')).toBe(true);
  });
});
