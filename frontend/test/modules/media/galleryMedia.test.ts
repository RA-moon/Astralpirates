import { describe, expect, it } from 'vitest';

import {
  deduceGalleryMediaType,
  isGalleryMimeTypeAllowed,
  resolveGalleryUploadMimeType,
} from '~/modules/media/galleryMedia';

describe('galleryMedia helpers', () => {
  it('classifies media types from mime type', () => {
    expect(deduceGalleryMediaType({ mimeType: 'image/jpeg' })).toBe('image');
    expect(deduceGalleryMediaType({ mimeType: 'video/webm' })).toBe('video');
    expect(deduceGalleryMediaType({ mimeType: 'audio/mpeg' })).toBe('audio');
    expect(deduceGalleryMediaType({ mimeType: 'model/gltf-binary' })).toBe('model');
  });

  it('classifies media types from URL extension when mime type is unavailable', () => {
    expect(deduceGalleryMediaType({ url: 'https://example.com/clip.mp4' })).toBe('video');
    expect(deduceGalleryMediaType({ url: 'https://example.com/briefing.mp3' })).toBe('audio');
    expect(deduceGalleryMediaType({ url: 'https://example.com/ship.glb' })).toBe('model');
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
        filename: 'briefing.m4a',
      }),
    ).toBe('audio');
  });

  it('prefers inferred model/video when explicit type is stale image', () => {
    expect(
      deduceGalleryMediaType({
        mediaType: 'image',
        mimeType: 'model/gltf-binary',
      }),
    ).toBe('model');
    expect(
      deduceGalleryMediaType({
        mediaType: 'image',
        url: 'https://example.com/clip.mp4',
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

  it('resolves upload mime type from filename extension fallback', () => {
    const modelFile = new File(['abc'], 'craft.glb', { type: 'application/octet-stream' });
    expect(resolveGalleryUploadMimeType(modelFile)).toBe('model/gltf-binary');
  });

  it('falls back to extension for obj/gltf/stl when browsers report generic types', () => {
    const objFile = new File(['abc'], 'craft.obj', { type: 'text/plain' });
    const gltfFile = new File(['abc'], 'craft.gltf', { type: 'application/json' });
    const stlFile = new File(['abc'], 'craft.stl', { type: 'application/sla' });

    expect(resolveGalleryUploadMimeType(objFile)).toBe('model/obj');
    expect(resolveGalleryUploadMimeType(gltfFile)).toBe('model/gltf+json');
    expect(resolveGalleryUploadMimeType(stlFile)).toBe('model/stl');
  });

  it('validates allowed gallery mime types', () => {
    expect(isGalleryMimeTypeAllowed('video/mp4')).toBe(true);
    expect(isGalleryMimeTypeAllowed('audio/mpeg')).toBe(true);
    expect(isGalleryMimeTypeAllowed('model/gltf+json')).toBe(true);
    expect(isGalleryMimeTypeAllowed('application/pdf')).toBe(false);
  });
});
