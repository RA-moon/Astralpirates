import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportClientEvent } from '~/utils/errorReporter';
import { normalizeInternalMediaUrl, resolveGalleryUploadDisplayUrl } from '~/modules/media/galleryUrls';

vi.mock('~/utils/errorReporter', () => ({
  reportClientEvent: vi.fn(),
}));

afterEach(() => {
  delete (globalThis as any).__mockRuntimeConfig;
  vi.mocked(reportClientEvent).mockReset();
});

describe('resolveGalleryUploadDisplayUrl', () => {
  it('returns external URL unchanged for manual URL slides', () => {
    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'url',
      imageUrl: 'https://example.com/cover.jpg',
      asset: null,
    });

    expect(resolved).toBe('https://example.com/cover.jpg');
  });

  it('rewrites non-resolving internal hosts to gallery proxy paths for URL slides', () => {
    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'url',
      imageUrl: 'https://cms.astralpirates.com/api/gallery-images/file/stupp_thomas-1.jpg',
      asset: null,
    });

    expect(resolved).toBe('/api/gallery-images/file/stupp_thomas-1.jpg?fallback=image');
  });

  it('emits rewrite fallback telemetry when non-resolving gallery hosts are normalized', () => {
    resolveGalleryUploadDisplayUrl({
      imageType: 'url',
      imageUrl: 'https://cms.astralpirates.com/api/gallery-images/file/stupp_thomas-1.jpg',
      asset: null,
    });

    expect(reportClientEvent).toHaveBeenCalledTimes(1);
    expect(reportClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'gallery-url-rewrite-fallback',
        component: 'galleryUrls',
        level: 'warn',
        meta: expect.objectContaining({
          hostname: 'cms.astralpirates.com',
          imageType: 'url',
          sourcePath: '/api/gallery-images/file/stupp_thomas-1.jpg',
          resolvedPath: '/api/gallery-images/file/stupp_thomas-1.jpg',
        }),
      }),
    );
  });

  it('rewrites non-resolving internal hosts to avatar proxy paths for URL slides', () => {
    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'url',
      imageUrl: 'https://artifact.astralpirates.com/avatars/Pasted%20Graphic%203-3.jpg',
      asset: null,
    });

    expect(resolved).toBe('/api/avatars/file/Pasted%20Graphic%203-3.jpg?fallback=image');
  });

  it('builds a gallery proxy path from filename when upload URL is unavailable', () => {
    (globalThis as any).__mockRuntimeConfig = () => ({
      astralApiBase: 'http://cms:3000',
      public: { astralApiBase: 'http://cms:3000' },
    });

    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'upload',
      imageUrl: '',
      asset: {
        filename: 'flightplans/mission one.png',
      },
    });

    expect(resolved).toBe('/api/gallery-images/file/flightplans/mission%20one.png?fallback=image');
  });

  it('derives the filename from upload URL when relation metadata is missing', () => {
    (globalThis as any).__mockRuntimeConfig = () => ({
      astralApiBase: 'http://cms:3000',
      public: { astralApiBase: 'http://cms:3000' },
    });

    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'upload',
      imageUrl: 'https://artifact.astralpirates.com/gallery/mission%20two.png',
      asset: null,
    });

    expect(resolved).toBe(
      '/api/gallery-images/file/mission%20two.png?fallback=image',
    );
  });

  it('normalizes relative gallery paths to the gallery file proxy', () => {
    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'upload',
      imageUrl: '/gallery/mission%20three.png',
      asset: null,
    });

    expect(resolved).toBe('/api/gallery-images/file/mission%20three.png?fallback=image');
  });

  it('prefers upload relation URL over stale slide imageUrl for upload slides', () => {
    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'upload',
      imageUrl: '/api/gallery-images/file/stale.png',
      asset: {
        url: 'https://artifact.astralpirates.com/gallery/current.png',
        filename: 'current.png',
      },
    });

    expect(resolved).toBe('/api/gallery-images/file/current.png?fallback=image');
  });

  it('forces upload-backed slides to same-origin proxy when filename metadata exists', () => {
    const resolved = resolveGalleryUploadDisplayUrl({
      imageType: 'upload',
      imageUrl: 'https://media.astralpirates.net/gallery/new-model.glb',
      asset: {
        filename: 'new-model.glb',
        url: 'https://media.astralpirates.net/gallery/new-model.glb',
      },
    });

    expect(resolved).toBe('/api/gallery-images/file/new-model.glb?fallback=image');
  });
});

describe('normalizeInternalMediaUrl', () => {
  it('rewrites known internal absolute avatar URLs to same-origin api paths', () => {
    const resolved = normalizeInternalMediaUrl(
      'https://artifact.astralpirates.com/avatars/Pasted%20Graphic%203-3.jpg',
    );

    expect(resolved).toBe('/api/avatars/file/Pasted%20Graphic%203-3.jpg?fallback=image');
  });

  it('keeps external third-party URLs unchanged', () => {
    const resolved = normalizeInternalMediaUrl('https://example.com/avatars/captain.jpg');

    expect(resolved).toBe('https://example.com/avatars/captain.jpg');
  });

  it('adds fallback query to absolute internal proxy URLs', () => {
    const resolved = normalizeInternalMediaUrl(
      'https://astralpirates.com/api/gallery-images/file/mission.png',
    );

    expect(resolved).toBe('/api/gallery-images/file/mission.png?fallback=image');
  });

  it('is idempotent for already-normalized avatar proxy URLs', () => {
    const resolved = normalizeInternalMediaUrl(
      '/api/avatars/file/Pasted%20Graphic%203.jpg?fallback=image',
    );

    expect(resolved).toBe('/api/avatars/file/Pasted%20Graphic%203.jpg?fallback=image');
  });

  it('rewrites known internal honor-badge URLs to same-origin badge proxy paths', () => {
    const resolved = normalizeInternalMediaUrl(
      'https://cms.astralpirates.com/media/badges/pioneer.svg',
    );

    expect(resolved).toBe('/api/honor-badge-media/file/pioneer.svg');
  });

  it('prefixes proxy paths with relative API base in dev proxy mode', () => {
    (globalThis as any).__mockRuntimeConfig = () => ({
      astralApiBase: '/cms-api',
      public: { astralApiBase: '/cms-api' },
    });

    const galleryResolved = normalizeInternalMediaUrl(
      'https://cms.astralpirates.com/api/gallery-images/file/mission.png',
    );
    const avatarResolved = normalizeInternalMediaUrl('/media/avatars/Captain One.png');
    const honorResolved = normalizeInternalMediaUrl(
      'https://cms.astralpirates.com/api/honor-badge-media/file/pioneer.svg',
    );

    expect(galleryResolved).toBe('/cms-api/api/gallery-images/file/mission.png?fallback=image');
    expect(avatarResolved).toBe('/cms-api/api/avatars/file/Captain%20One.png?fallback=image');
    expect(honorResolved).toBe('/cms-api/api/honor-badge-media/file/pioneer.svg');
  });
});
