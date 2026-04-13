import { describe, expect, it } from 'vitest';

import {
  extractPublicGalleryUploadError,
  isForceGalleryDeleteRequested,
  isGalleryRouteNotFoundError,
  summarizeGalleryUploadFile,
} from './galleryRouteShared';

describe('galleryRouteShared', () => {
  it('summarizes non-file payloads', () => {
    expect(summarizeGalleryUploadFile(null)).toEqual({
      isFile: false,
      receivedType: 'null',
    });
    expect(summarizeGalleryUploadFile('x')).toEqual({
      isFile: false,
      receivedType: 'string',
    });
  });

  it('summarizes file payloads', () => {
    const file = new File(['hello'], 'demo.jpg', { type: 'image/jpeg' });
    expect(summarizeGalleryUploadFile(file)).toMatchObject({
      isFile: true,
      name: 'demo.jpg',
      type: 'image/jpeg',
      size: 5,
      inferredMimeType: 'image/jpeg',
      mediaType: 'image',
      isAudioMedia: false,
    });
  });

  it('marks audio upload candidates in telemetry fields', () => {
    const file = new File(['audio'], 'briefing.mp3', { type: 'audio/mpeg' });
    expect(summarizeGalleryUploadFile(file)).toMatchObject({
      mediaType: 'audio',
      isAudioMedia: true,
      inferredMimeType: 'audio/mpeg',
    });
  });

  it('extracts public upload validation errors', () => {
    const error = {
      status: 400,
      isPublic: true,
      data: {
        errors: [{ message: 'Invalid file type.' }],
      },
    };
    expect(extractPublicGalleryUploadError(error)).toEqual({
      status: 400,
      message: 'Invalid file type.',
    });
  });

  it('ignores non-public upload errors', () => {
    expect(
      extractPublicGalleryUploadError({
        status: 400,
        isPublic: false,
        message: 'Hidden',
      }),
    ).toBeNull();
  });

  it('detects not-found errors from status and message forms', () => {
    expect(isGalleryRouteNotFoundError({ status: 404 })).toBe(true);
    expect(isGalleryRouteNotFoundError({ message: 'Not Found' })).toBe(true);
    expect(isGalleryRouteNotFoundError({ status: 500 })).toBe(false);
  });

  it('parses force delete query flag', () => {
    expect(isForceGalleryDeleteRequested(new URLSearchParams())).toBe(false);
    expect(isForceGalleryDeleteRequested(new URLSearchParams('force=true'))).toBe(true);
    expect(isForceGalleryDeleteRequested(new URLSearchParams('force=1'))).toBe(true);
    expect(isForceGalleryDeleteRequested(new URLSearchParams('force=no'))).toBe(false);
  });
});
