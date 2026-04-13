import { afterEach, describe, expect, it } from 'vitest';

import { resolveSignedRedirectUrlForMedia } from './mediaPrivateDelivery';

const originalEnv = {
  MEDIA_PRIVATE_DELIVERY_MODE: process.env.MEDIA_PRIVATE_DELIVERY_MODE,
  MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER,
  MEDIA_PRIVATE_REDIRECT_BASE_URL: process.env.MEDIA_PRIVATE_REDIRECT_BASE_URL,
  MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
  MEDIA_S3_REGION: process.env.MEDIA_S3_REGION,
  MEDIA_S3_ACCESS_KEY_ID: process.env.MEDIA_S3_ACCESS_KEY_ID,
  MEDIA_S3_SECRET_ACCESS_KEY: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
  MEDIA_BUCKET_GALLERY: process.env.MEDIA_BUCKET_GALLERY,
  MEDIA_BUCKET_BADGES: process.env.MEDIA_BUCKET_BADGES,
  MEDIA_SIGNED_URL_TTL_SECONDS: process.env.MEDIA_SIGNED_URL_TTL_SECONDS,
};

afterEach(() => {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  });
});

describe('resolveSignedRedirectUrlForMedia', () => {
  it('returns null when signed redirects are disabled', () => {
    process.env.MEDIA_PRIVATE_DELIVERY_MODE = 'proxy';
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_PRIVATE_REDIRECT_BASE_URL = 'https://artifact.example.test';
    process.env.MEDIA_S3_ACCESS_KEY_ID = 'key';
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = 'secret';

    const result = resolveSignedRedirectUrlForMedia({
      mediaClass: 'gallery',
      objectPath: 'path/to/asset.jpg',
    });

    expect(result).toBeNull();
  });

  it('returns null outside seaweedfs mode', () => {
    process.env.MEDIA_PRIVATE_DELIVERY_MODE = 'signed-redirect';
    process.env.MEDIA_STORAGE_PROVIDER = 'local';
    process.env.MEDIA_PRIVATE_REDIRECT_BASE_URL = 'https://artifact.example.test';
    process.env.MEDIA_S3_ACCESS_KEY_ID = 'key';
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = 'secret';

    const result = resolveSignedRedirectUrlForMedia({
      mediaClass: 'gallery',
      objectPath: 'path/to/asset.jpg',
    });

    expect(result).toBeNull();
  });

  it('builds a signed URL in signed-redirect seaweed mode', () => {
    process.env.MEDIA_PRIVATE_DELIVERY_MODE = 'signed-redirect';
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_PRIVATE_REDIRECT_BASE_URL = 'https://artifact.example.test';
    process.env.MEDIA_S3_REGION = 'us-east-1';
    process.env.MEDIA_S3_ACCESS_KEY_ID = 'access-key';
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = 'secret-key';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';
    process.env.MEDIA_SIGNED_URL_TTL_SECONDS = '120';

    const result = resolveSignedRedirectUrlForMedia({
      mediaClass: 'gallery',
      objectPath: 'path/to/asset.jpg',
      downloadFilename: 'asset.jpg',
    });

    expect(result).toBeTruthy();
    expect(result).toContain('https://artifact.example.test/gallery/path/to/asset.jpg?');
    expect(result).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(result).toContain('X-Amz-Expires=120');
    expect(result).toContain('X-Amz-Signature=');
    expect(result).toContain('response-content-disposition=');
  });

  it('builds a signed URL for badge media in signed-redirect seaweed mode', () => {
    process.env.MEDIA_PRIVATE_DELIVERY_MODE = 'signed-redirect';
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_PRIVATE_REDIRECT_BASE_URL = 'https://artifact.example.test';
    process.env.MEDIA_S3_REGION = 'us-east-1';
    process.env.MEDIA_S3_ACCESS_KEY_ID = 'access-key';
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = 'secret-key';
    process.env.MEDIA_BUCKET_BADGES = 'badges';
    process.env.MEDIA_SIGNED_URL_TTL_SECONDS = '120';

    const result = resolveSignedRedirectUrlForMedia({
      mediaClass: 'badges',
      objectPath: 'icons/pioneer.mp4',
      downloadFilename: 'pioneer.mp4',
    });

    expect(result).toBeTruthy();
    expect(result).toContain('https://artifact.example.test/badges/icons/pioneer.mp4?');
    expect(result).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(result).toContain('X-Amz-Expires=120');
    expect(result).toContain('X-Amz-Signature=');
    expect(result).toContain('response-content-disposition=');
  });
});
