import { describe, expect, it } from 'vitest';

import {
  AVATAR_FILE_ACCEPT,
  AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  isEmbeddableAvatarModelUrl,
  normalizeAvatarMediaRecord,
  validateAvatarUploadFile,
} from '~/modules/media/avatarMedia';

describe('avatarMedia module', () => {
  it('normalizes avatar media fields and infers non-image media types', () => {
    const normalized = normalizeAvatarMediaRecord({
      avatarUrl: 'https://artifact.astralpirates.com/avatars/Captain%20Clip.mp4',
      avatarMediaType: 'image',
      avatarMediaUrl: null,
      avatarMimeType: null,
      avatarFilename: null,
    });

    expect(normalized.avatarUrl).toBe('/api/avatars/file/Captain%20Clip.mp4');
    expect(normalized.avatarMediaUrl).toBe('/api/avatars/file/Captain%20Clip.mp4');
    expect(normalized.avatarMediaType).toBe('video');
    expect(normalized.avatarMimeType).toBe('video/mp4');
    expect(normalized.avatarFilename).toBe('Captain Clip.mp4');
  });

  it('detects embeddable model URLs', () => {
    expect(isEmbeddableAvatarModelUrl('/api/avatars/file/ship.glb')).toBe(true);
    expect(isEmbeddableAvatarModelUrl('/api/avatars/file/ship.gltf')).toBe(false);
  });

  it('validates avatar uploads by size and type', () => {
    const oversized = new File([
      new Uint8Array(AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES + 1),
    ], 'oversized.png', { type: 'image/png' });
    const oversizedResult = validateAvatarUploadFile(oversized);
    expect(oversizedResult.ok).toBe(false);

    const unsupported = new File([new Uint8Array([1, 2, 3])], 'avatar.txt', {
      type: 'text/plain',
    });
    const unsupportedResult = validateAvatarUploadFile(unsupported);
    expect(unsupportedResult.ok).toBe(false);

    const validModel = new File([new Uint8Array([1, 2, 3])], 'avatar.glb', {
      type: 'model/gltf-binary',
    });
    const validResult = validateAvatarUploadFile(validModel);
    expect(validResult).toMatchObject({ ok: true, mediaType: 'model' });
  });

  it('builds a broad avatar accept string for file inputs', () => {
    expect(AVATAR_FILE_ACCEPT).toContain('.glb');
    expect(AVATAR_FILE_ACCEPT).toContain('video/mp4');
  });
});
