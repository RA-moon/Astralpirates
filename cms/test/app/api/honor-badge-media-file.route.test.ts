import path from 'node:path';
import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { GET, HEAD } from '@/app/api/honor-badge-media/file/[...slug]/route';

const badgesDir = path.join(process.cwd(), 'public', 'media', 'badges');
const createdFiles = new Set<string>();

const originalEnv = {
  MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER,
  MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
  MEDIA_S3_INTERNAL_ENDPOINT: process.env.MEDIA_S3_INTERNAL_ENDPOINT,
  MEDIA_BUCKET_BADGES: process.env.MEDIA_BUCKET_BADGES,
  MEDIA_S3_REGION: process.env.MEDIA_S3_REGION,
  MEDIA_S3_ACCESS_KEY_ID: process.env.MEDIA_S3_ACCESS_KEY_ID,
  MEDIA_S3_SECRET_ACCESS_KEY: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
};

const makeRequest = (pathname: string): NextRequest => {
  const parsed = new URL(pathname, 'https://astralpirates.com');
  return ({
    headers: new Headers(),
    nextUrl: {
      pathname: parsed.pathname,
      searchParams: parsed.searchParams,
    },
  }) as unknown as NextRequest;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(async () => {
  for (const filePath of createdFiles) {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors for already removed files.
    }
  }
  createdFiles.clear();

  if (typeof originalEnv.MEDIA_STORAGE_PROVIDER === 'string') {
    process.env.MEDIA_STORAGE_PROVIDER = originalEnv.MEDIA_STORAGE_PROVIDER;
  } else {
    delete process.env.MEDIA_STORAGE_PROVIDER;
  }

  if (typeof originalEnv.MEDIA_S3_ENDPOINT === 'string') {
    process.env.MEDIA_S3_ENDPOINT = originalEnv.MEDIA_S3_ENDPOINT;
  } else {
    delete process.env.MEDIA_S3_ENDPOINT;
  }

  if (typeof originalEnv.MEDIA_S3_INTERNAL_ENDPOINT === 'string') {
    process.env.MEDIA_S3_INTERNAL_ENDPOINT = originalEnv.MEDIA_S3_INTERNAL_ENDPOINT;
  } else {
    delete process.env.MEDIA_S3_INTERNAL_ENDPOINT;
  }

  if (typeof originalEnv.MEDIA_BUCKET_BADGES === 'string') {
    process.env.MEDIA_BUCKET_BADGES = originalEnv.MEDIA_BUCKET_BADGES;
  } else {
    delete process.env.MEDIA_BUCKET_BADGES;
  }

  if (typeof originalEnv.MEDIA_S3_REGION === 'string') {
    process.env.MEDIA_S3_REGION = originalEnv.MEDIA_S3_REGION;
  } else {
    delete process.env.MEDIA_S3_REGION;
  }

  if (typeof originalEnv.MEDIA_S3_ACCESS_KEY_ID === 'string') {
    process.env.MEDIA_S3_ACCESS_KEY_ID = originalEnv.MEDIA_S3_ACCESS_KEY_ID;
  } else {
    delete process.env.MEDIA_S3_ACCESS_KEY_ID;
  }

  if (typeof originalEnv.MEDIA_S3_SECRET_ACCESS_KEY === 'string') {
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = originalEnv.MEDIA_S3_SECRET_ACCESS_KEY;
  } else {
    delete process.env.MEDIA_S3_SECRET_ACCESS_KEY;
  }

  if (typeof originalEnv.AWS_ACCESS_KEY_ID === 'string') {
    process.env.AWS_ACCESS_KEY_ID = originalEnv.AWS_ACCESS_KEY_ID;
  } else {
    delete process.env.AWS_ACCESS_KEY_ID;
  }

  if (typeof originalEnv.AWS_SECRET_ACCESS_KEY === 'string') {
    process.env.AWS_SECRET_ACCESS_KEY = originalEnv.AWS_SECRET_ACCESS_KEY;
  } else {
    delete process.env.AWS_SECRET_ACCESS_KEY;
  }

  if (typeof originalEnv.AWS_REGION === 'string') {
    process.env.AWS_REGION = originalEnv.AWS_REGION;
  } else {
    delete process.env.AWS_REGION;
  }

  if (typeof originalEnv.AWS_DEFAULT_REGION === 'string') {
    process.env.AWS_DEFAULT_REGION = originalEnv.AWS_DEFAULT_REGION;
  } else {
    delete process.env.AWS_DEFAULT_REGION;
  }

  vi.restoreAllMocks();
});

describe('honor badge media file route', () => {
  it('returns 404 when file is missing', async () => {
    const response = await GET(makeRequest('/api/honor-badge-media/file/missing.svg'), {
      params: Promise.resolve({ slug: ['missing.svg'] }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 404 for invalid relative paths', async () => {
    const response = await GET(makeRequest('/api/honor-badge-media/file/%2E%2E/evil.svg'), {
      params: Promise.resolve({ slug: ['..', 'evil.svg'] }),
    });

    expect(response.status).toBe(404);
  });

  it('serves local svg files with image content-type', async () => {
    delete process.env.MEDIA_STORAGE_PROVIDER;

    await fs.mkdir(badgesDir, { recursive: true });
    const filename = `vitest-badge-${Date.now()}.svg`;
    const filePath = path.join(badgesDir, filename);
    await fs.writeFile(filePath, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/honor-badge-media/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('supports HEAD for local badge files', async () => {
    delete process.env.MEDIA_STORAGE_PROVIDER;

    await fs.mkdir(badgesDir, { recursive: true });
    const filename = `vitest-badge-head-${Date.now()}.mp4`;
    const filePath = path.join(badgesDir, filename);
    await fs.writeFile(filePath, Buffer.from('badge-video'));
    createdFiles.add(filePath);

    const response = await HEAD(makeRequest(`/api/honor-badge-media/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('Content-Length')).toBeTruthy();
  });

  it('falls back to seaweed endpoint when local file is missing', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_BADGES = 'badges';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-badge-object'), {
          status: 200,
          headers: {
            'Content-Type': 'image/svg+xml',
            'Content-Length': '19',
          },
        }),
      );

    const response = await GET(makeRequest('/api/honor-badge-media/file/pioneer.svg'), {
      params: Promise.resolve({ slug: ['pioneer.svg'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://127.0.0.1:8333/badges/pioneer.svg');
    expect(options?.method).toBe('GET');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('sets attachment content-disposition when download mode is requested', async () => {
    await fs.mkdir(badgesDir, { recursive: true });
    const filename = `vitest-badge-download-${Date.now()}.svg`;
    const filePath = path.join(badgesDir, filename);
    await fs.writeFile(filePath, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    createdFiles.add(filePath);

    const response = await GET(
      makeRequest(`/api/honor-badge-media/file/${filename}?download=true`),
      {
        params: Promise.resolve({ slug: [filename] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${filename}"`);
  });
});
