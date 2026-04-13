import { describe, expect, it } from 'vitest';

import {
  pruneGalleryImageFromPageLayout,
  pruneGalleryImageFromSlides,
} from './galleryReferencePrune';

describe('pruneGalleryImageFromSlides', () => {
  it('removes matching upload slides and keeps URL slides', () => {
    const result = pruneGalleryImageFromSlides({
      slides: [
        { id: 'a', galleryImage: 7, imageType: 'upload' },
        { id: 'b', imageUrl: 'https://example.com/clip.mp4', imageType: 'url' },
        { id: 'c', galleryImage: { id: '8' }, imageType: 'upload' },
      ],
      galleryImageId: 7,
    });

    expect(result.changed).toBe(true);
    expect(result.slides).toHaveLength(2);
    expect((result.slides[0] as Record<string, unknown>).id).toBe('b');
    expect((result.slides[1] as Record<string, unknown>).id).toBe('c');
  });

  it('returns unchanged when there is no match', () => {
    const result = pruneGalleryImageFromSlides({
      slides: [{ galleryImage: 3 }],
      galleryImageId: 9,
    });

    expect(result.changed).toBe(false);
    expect(result.slides).toEqual([{ galleryImage: 3 }]);
  });
});

describe('pruneGalleryImageFromPageLayout', () => {
  it('removes matching upload slides from imageCarousel blocks only', () => {
    const result = pruneGalleryImageFromPageLayout({
      layout: [
        { blockType: 'hero', title: 'Intro' },
        {
          blockType: 'imageCarousel',
          slides: [
            { id: 'slide-1', galleryImage: 22 },
            { id: 'slide-2', imageUrl: 'https://example.com/cat.jpg' },
          ],
        },
        {
          blockType: 'imageCarousel',
          slides: [{ id: 'slide-3', galleryImage: 93 }],
        },
      ],
      galleryImageId: 22,
    });

    expect(result.changed).toBe(true);
    const carouselA = result.layout[1] as Record<string, unknown>;
    const carouselASlides = carouselA.slides as Array<Record<string, unknown>>;
    expect(carouselASlides).toHaveLength(1);
    expect(carouselASlides[0].id).toBe('slide-2');

    const carouselB = result.layout[2] as Record<string, unknown>;
    const carouselBSlides = carouselB.slides as Array<Record<string, unknown>>;
    expect(carouselBSlides).toHaveLength(1);
    expect(carouselBSlides[0].id).toBe('slide-3');
  });
});
