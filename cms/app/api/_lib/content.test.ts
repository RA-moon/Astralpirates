import { describe, expect, it, vi } from 'vitest';

import { normalizeFlightPlanSlides, resolveGalleryAssetUrl, sanitizeFlightPlan } from './content';
import type { CrewSummary } from './crew';

const makeOwner = (overrides: Partial<CrewSummary> = {}): CrewSummary => {
  const merged = {
    id: 1,
    displayName: 'Owner',
    profileSlug: 'owner',
    role: 'captain' as const,
    firstName: null,
    lastName: null,
    callSign: 'Owner',
    avatarUrl: null,
    avatarMediaType: 'image' as const,
    avatarMediaUrl: null,
    avatarMimeType: null,
    avatarFilename: null,
    ...overrides,
  };

  return {
    id: merged.id ?? 1,
    displayName: merged.displayName ?? 'Owner',
    profileSlug: merged.profileSlug ?? 'owner',
    role: merged.role ?? 'captain',
    firstName: merged.firstName ?? null,
    lastName: merged.lastName ?? null,
    callSign: merged.callSign ?? null,
    avatarUrl: merged.avatarUrl ?? null,
    avatarMediaType: merged.avatarMediaType ?? 'image',
    avatarMediaUrl: merged.avatarMediaUrl ?? null,
    avatarMimeType: merged.avatarMimeType ?? null,
    avatarFilename: merged.avatarFilename ?? null,
  };
};

describe('sanitizeFlightPlan', () => {
  it('defaults category to project', () => {
    const ownerMap = new Map<number, CrewSummary>([[1, makeOwner()]]);
    const result = sanitizeFlightPlan(
      {
        id: 7,
        title: 'Demo',
        slug: 'demo',
        path: '/bridge/flight-plans/demo',
        summary: null,
        body: [],
        location: null,
        dateCode: null,
        displayDate: null,
        eventDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: 1,
      } as any,
      ownerMap,
    );
    expect(result.category).toBe('project');
  });

  it('keeps valid category values', () => {
    const ownerMap = new Map<number, CrewSummary>([[1, makeOwner()]]);
    const withEvent = sanitizeFlightPlan(
      {
        id: 8,
        title: 'Event',
        slug: 'event',
        path: '/bridge/flight-plans/event',
        summary: null,
        body: [],
        location: null,
        dateCode: null,
        displayDate: null,
        eventDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: 1,
        category: 'event',
      } as any,
      ownerMap,
    );
    const withTest = sanitizeFlightPlan(
      {
        id: 9,
        title: 'Test',
        slug: 'test',
        path: '/bridge/flight-plans/test',
        summary: null,
        body: [],
        location: null,
        dateCode: null,
        displayDate: null,
        eventDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: 1,
        category: 'test',
      } as any,
      ownerMap,
    );
    expect(withEvent.category).toBe('event');
    expect(withTest.category).toBe('test');
  });

  it('retains uploaded slides that only expose relative media paths', () => {
    const ownerMap = new Map<number, CrewSummary>([[1, makeOwner()]]);
    const result = sanitizeFlightPlan(
      {
        id: 10,
        title: 'Relative media',
        slug: 'relative-media',
        path: '/bridge/flight-plans/relative-media',
        summary: null,
        body: [],
        location: null,
        dateCode: null,
        displayDate: null,
        eventDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: 1,
        gallerySlides: [
          {
            imageType: 'upload',
            imageAlt: 'Launch crew',
            galleryImage: {
              id: 45,
              filename: 'launch.jpg',
              sizes: {
                preview: {
                  url: '/media/gallery/launch-preview.jpg',
                },
              },
            },
          },
        ],
      } as any,
      ownerMap,
    );

    expect(result.gallerySlides).toHaveLength(1);
    expect(result.gallerySlides[0]?.imageUrl).toBe('/api/gallery-images/file/launch.jpg');
    expect(result.gallerySlides[0]?.asset?.url).toBe('/api/gallery-images/file/launch.jpg');
  });
});

describe('resolveGalleryAssetUrl', () => {
  it('falls back to gallery proxy url when upload urls are missing', () => {
    const resolved = resolveGalleryAssetUrl({
      id: 99,
      filename: 'fallback-image.webp',
    });

    expect(resolved).toBe('/api/gallery-images/file/fallback-image.webp');
  });

  it('uses media base and bucket fallback in seaweedfs mode', async () => {
    const envKeys = ['MEDIA_STORAGE_PROVIDER', 'MEDIA_BASE_URL', 'MEDIA_BUCKET_GALLERY'] as const;
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_BASE_URL = 'https://artifact.astralpirates.com';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';
    vi.resetModules();

    try {
      const contentModule = await import('./content');
      const resolved = contentModule.resolveGalleryAssetUrl({
        id: 100,
        filename: 'seaweed-fallback.webp',
      });
      expect(resolved).toBe('/api/gallery-images/file/seaweed-fallback.webp');
    } finally {
      envKeys.forEach((key) => {
        const value = previous[key];
        if (typeof value === 'string') {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      });
      vi.resetModules();
    }
  });

  it('prefers proxy urls for cms-hosted gallery assets when filename is available', () => {
    const resolved = resolveGalleryAssetUrl({
      id: 101,
      filename: 'stupp_thomas-1.jpg',
      url: 'https://cms.astralpirates.com/api/gallery-images/file/stupp_thomas-1.jpg',
    });

    expect(resolved).toBe('/api/gallery-images/file/stupp_thomas-1.jpg');
  });
});

describe('normalizeFlightPlanSlides', () => {
  it('keeps external URLs and relative upload URLs together', () => {
    const slides = normalizeFlightPlanSlides([
      {
        imageType: 'url',
        imageUrl: 'http://example.com/sample.jpg',
        imageAlt: 'External',
      },
      {
        imageType: 'upload',
        imageAlt: 'Local',
        galleryImage: {
          id: 12,
          url: '/media/gallery/local.jpg',
        },
      },
    ]);

    expect(slides).toHaveLength(2);
    expect(slides[0]?.imageUrl).toBe('https://example.com/sample.jpg');
    expect(slides[1]?.imageUrl).toBe('/media/gallery/local.jpg');
  });

  it('derives mediaType for video and 3D model slides', () => {
    const slides = normalizeFlightPlanSlides([
      {
        imageType: 'upload',
        imageAlt: 'Crew briefing clip',
        galleryImage: {
          id: 20,
          filename: 'briefing.mp4',
          url: '/media/gallery/briefing.mp4',
          mimeType: 'video/mp4',
        },
      },
      {
        imageType: 'url',
        imageAlt: 'Ship model',
        imageUrl: 'https://cdn.example.com/models/ship.glb',
      },
    ]);

    expect(slides).toHaveLength(2);
    expect(slides[0]?.imageUrl).toBe('/api/gallery-images/file/briefing.mp4');
    expect(slides[0]?.mediaType).toBe('video');
    expect(slides[1]?.mediaType).toBe('model');
  });
});
