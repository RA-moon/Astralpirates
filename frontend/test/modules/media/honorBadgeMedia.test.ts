import { describe, expect, it } from 'vitest';

import {
  isEmbeddableHonorBadgeModelUrl,
  normalizeHonorBadgeMediaRecord,
} from '~/modules/media/honorBadgeMedia';

describe('honorBadgeMedia module', () => {
  it('normalizes internal badge URLs and infers media metadata', () => {
    const normalized = normalizeHonorBadgeMediaRecord({
      iconUrl: 'https://cms.astralpirates.com/media/badges/pioneer.mp4',
      iconMediaUrl: null,
      iconMimeType: null,
      iconFilename: null,
    });

    expect(normalized.iconUrl).toBe('/api/honor-badge-media/file/pioneer.mp4');
    expect(normalized.iconMediaUrl).toBe('/api/honor-badge-media/file/pioneer.mp4');
    expect(normalized.iconMediaType).toBe('video');
    expect(normalized.iconMimeType).toBe('video/mp4');
    expect(normalized.iconFilename).toBe('pioneer.mp4');
  });

  it('preserves external URLs and infers model media type from extension', () => {
    const normalized = normalizeHonorBadgeMediaRecord({
      iconUrl: 'https://example.com/badges/pioneer.glb',
      iconMediaUrl: null,
      iconMimeType: null,
      iconFilename: null,
    });

    expect(normalized.iconUrl).toBe('https://example.com/badges/pioneer.glb');
    expect(normalized.iconMediaUrl).toBe('https://example.com/badges/pioneer.glb');
    expect(normalized.iconMediaType).toBe('model');
    expect(normalized.iconMimeType).toBe('model/gltf-binary');
  });

  it('detects embeddable model URLs', () => {
    expect(isEmbeddableHonorBadgeModelUrl('/api/honor-badge-media/file/pioneer.glb')).toBe(true);
    expect(isEmbeddableHonorBadgeModelUrl('/api/honor-badge-media/file/pioneer.gltf')).toBe(
      false,
    );
  });
});
