import { describe, expect, it } from 'vitest';

import {
  collectGalleryImageIdsFromPageLayout,
  collectGalleryImageIdsFromSlides,
  normaliseGalleryImageId,
} from './galleryReferences';

describe('normaliseGalleryImageId', () => {
  it('normalises scalar and nested relation ids', () => {
    expect(normaliseGalleryImageId(7)).toBe(7);
    expect(normaliseGalleryImageId('42')).toBe(42);
    expect(normaliseGalleryImageId({ id: '11' })).toBe(11);
  });

  it('returns null for invalid values', () => {
    expect(normaliseGalleryImageId(null)).toBeNull();
    expect(normaliseGalleryImageId(undefined)).toBeNull();
    expect(normaliseGalleryImageId('')).toBeNull();
    expect(normaliseGalleryImageId({})).toBeNull();
  });
});

describe('collectGalleryImageIdsFromSlides', () => {
  it('collects deduplicated upload ids from slide arrays', () => {
    const ids = collectGalleryImageIdsFromSlides([
      { galleryImage: 3 },
      { galleryImage: '3' },
      { galleryImage: { id: 5 } },
      { galleryImage: null },
      { imageUrl: 'https://example.com/image.jpg' },
    ]);

    expect(ids.sort((a, b) => a - b)).toEqual([3, 5]);
  });
});

describe('collectGalleryImageIdsFromPageLayout', () => {
  it('collects upload ids only from imageCarousel blocks', () => {
    const ids = collectGalleryImageIdsFromPageLayout([
      {
        blockType: 'hero',
        title: 'Intro',
      },
      {
        blockType: 'imageCarousel',
        slides: [
          { galleryImage: 9 },
          { galleryImage: { id: '10' } },
        ],
      },
      {
        blockType: 'imageCarousel',
        slides: [
          { imageUrl: 'https://example.com/video.mp4' },
          { galleryImage: 9 },
        ],
      },
    ]);

    expect(ids.sort((a, b) => a - b)).toEqual([9, 10]);
  });
});

