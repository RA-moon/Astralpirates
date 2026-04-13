import { describe, expect, it } from 'vitest';

import {
  asStatusCode,
  extractGalleryServerErrorMessage,
  isGalleryUploadTimeoutError,
  resolveGalleryUploadTimeoutMessage,
} from '~/modules/media/galleryRequestErrors';

describe('galleryRequestErrors helpers', () => {
  it('extracts HTTP status from error shapes', () => {
    expect(asStatusCode({ statusCode: 401 })).toBe(401);
    expect(asStatusCode({ response: { status: 504 } })).toBe(504);
    expect(asStatusCode({})).toBeNull();
  });

  it('detects timeout errors from status and message', () => {
    expect(isGalleryUploadTimeoutError({ statusCode: 408 })).toBe(true);
    expect(isGalleryUploadTimeoutError({ response: { status: 504 } })).toBe(true);
    expect(isGalleryUploadTimeoutError({ name: 'AbortError' })).toBe(true);
    expect(isGalleryUploadTimeoutError({ message: 'request timed out' })).toBe(true);
    expect(isGalleryUploadTimeoutError({ message: 'other error' })).toBe(false);
  });

  it('formats timeout message from timeout value', () => {
    expect(resolveGalleryUploadTimeoutMessage(45_000)).toBe(
      'Upload timed out after 45s. Please try again.',
    );
  });

  it('extracts server-side error payload messages', () => {
    expect(
      extractGalleryServerErrorMessage({
        data: { error: ' Upload failed. ' },
      }),
    ).toBe('Upload failed.');
    expect(extractGalleryServerErrorMessage({ data: { error: 12 } })).toBe('');
    expect(extractGalleryServerErrorMessage({})).toBe('');
  });
});
