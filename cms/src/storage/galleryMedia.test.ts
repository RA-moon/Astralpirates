import { describe, expect, it } from 'vitest';

import { deduceGalleryMediaType, resolveGalleryUploadMimeType } from './galleryMedia';

describe('galleryMedia helpers (cms)', () => {
  it('infers model/video/audio from metadata', () => {
    expect(deduceGalleryMediaType({ mimeType: 'model/gltf-binary' })).toBe('model');
    expect(deduceGalleryMediaType({ mimeType: 'video/webm' })).toBe('video');
    expect(deduceGalleryMediaType({ mimeType: 'audio/mpeg' })).toBe('audio');
  });

  it('uses extension inference when mime type is generic', () => {
    expect(
      deduceGalleryMediaType({
        mimeType: 'text/plain',
        filename: 'mesh.obj',
      }),
    ).toBe('model');
    expect(
      deduceGalleryMediaType({
        mimeType: 'application/octet-stream',
        filename: 'clip.webm',
      }),
    ).toBe('video');
    expect(
      deduceGalleryMediaType({
        mimeType: 'application/octet-stream',
        filename: 'briefing.mp3',
      }),
    ).toBe('audio');
  });

  it('prefers inferred non-image media when explicit type is stale image', () => {
    expect(
      deduceGalleryMediaType({
        mediaType: 'image',
        mimeType: 'model/gltf+json',
      }),
    ).toBe('model');
    expect(
      deduceGalleryMediaType({
        mediaType: 'image',
        url: 'https://example.com/media.mp4',
      }),
    ).toBe('video');
    expect(
      deduceGalleryMediaType({
        mediaType: 'image',
        mimeType: 'audio/mp4',
      }),
    ).toBe('audio');
  });

  it('preserves explicit non-image overrides', () => {
    expect(
      deduceGalleryMediaType({
        mediaType: 'model',
        mimeType: 'image/jpeg',
      }),
    ).toBe('model');
    expect(
      deduceGalleryMediaType({
        mediaType: 'video',
        mimeType: 'image/jpeg',
      }),
    ).toBe('video');
  });

  it('applies extension fallback for generic obj/gltf/stl MIME values', () => {
    expect(
      resolveGalleryUploadMimeType({
        fileType: 'text/plain',
        filename: 'mesh.obj',
      }),
    ).toBe('model/obj');
    expect(
      resolveGalleryUploadMimeType({
        fileType: 'application/json',
        filename: 'mesh.gltf',
      }),
    ).toBe('model/gltf+json');
    expect(
      resolveGalleryUploadMimeType({
        fileType: 'application/sla',
        filename: 'mesh.stl',
      }),
    ).toBe('model/stl');
  });
});
