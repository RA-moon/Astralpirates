import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

import { GET, HEAD } from '@/app/api/avatars/file/[...slug]/route';

const originalEnv = {
  MEDIA_GOVERNANCE_MODE: process.env.MEDIA_GOVERNANCE_MODE,
  MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER,
  MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
  MEDIA_S3_INTERNAL_ENDPOINT: process.env.MEDIA_S3_INTERNAL_ENDPOINT,
  MEDIA_BUCKET_AVATARS: process.env.MEDIA_BUCKET_AVATARS,
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
  delete process.env.MEDIA_GOVERNANCE_MODE;
});

afterEach(() => {
  if (typeof originalEnv.MEDIA_GOVERNANCE_MODE === 'string') {
    process.env.MEDIA_GOVERNANCE_MODE = originalEnv.MEDIA_GOVERNANCE_MODE;
  } else {
    delete process.env.MEDIA_GOVERNANCE_MODE;
  }

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

  if (typeof originalEnv.MEDIA_BUCKET_AVATARS === 'string') {
    process.env.MEDIA_BUCKET_AVATARS = originalEnv.MEDIA_BUCKET_AVATARS;
  } else {
    delete process.env.MEDIA_BUCKET_AVATARS;
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

describe('avatars file route', () => {
  it('serves local avatar files with image headers in local provider mode', async () => {
    delete process.env.MEDIA_STORAGE_PROVIDER;

    const avatarsDir = path.join(process.cwd(), 'public', 'media', 'avatars');
    const filename = 'tomi-route-test.jpg';
    const filePath = path.join(avatarsDir, filename);
    const fileBuffer = Buffer.from('avatar-bytes');

    await fs.mkdir(avatarsDir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    try {
      const getResponse = await GET(makeRequest(`/api/avatars/file/${filename}`), {
        params: Promise.resolve({ slug: [filename] }),
      });

      expect(getResponse.status).toBe(200);
      expect(getResponse.headers.get('Content-Type')).toBe('image/jpeg');
      expect(getResponse.headers.get('Content-Length')).toBe(String(fileBuffer.length));

      const headResponse = await HEAD(makeRequest(`/api/avatars/file/${filename}`), {
        params: Promise.resolve({ slug: [filename] }),
      });

      expect(headResponse.status).toBe(200);
      expect(headResponse.headers.get('Content-Type')).toBe('image/jpeg');
      expect(headResponse.headers.get('Content-Length')).toBe(String(fileBuffer.length));
    } finally {
      await fs.rm(filePath, { force: true });
    }
  });

  it('serves local avatar video files with video content-type headers', async () => {
    delete process.env.MEDIA_STORAGE_PROVIDER;

    const avatarsDir = path.join(process.cwd(), 'public', 'media', 'avatars');
    const filename = `captain-route-test-${Date.now()}.mp4`;
    const filePath = path.join(avatarsDir, filename);
    const fileBuffer = Buffer.from('avatar-video-bytes');

    await fs.mkdir(avatarsDir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    try {
      const response = await GET(makeRequest(`/api/avatars/file/${filename}`), {
        params: Promise.resolve({ slug: [filename] }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('video/mp4');
      expect(response.headers.get('Content-Length')).toBe(String(fileBuffer.length));
    } finally {
      await fs.rm(filePath, { force: true });
    }
  });

  it('returns 404 when avatar is missing', async () => {
    const response = await GET(makeRequest('/api/avatars/file/missing-avatar.jpg'), {
      params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 404 for invalid relative paths', async () => {
    const response = await GET(makeRequest('/api/avatars/file/%2E%2E/evil.jpg'), {
      params: Promise.resolve({ slug: ['..', 'evil.jpg'] }),
    });

    expect(response.status).toBe(404);
  });

  it('serves an SVG placeholder when fallback=image is requested', async () => {
    const response = await GET(
      makeRequest('/api/avatars/file/missing-avatar.jpg?fallback=image'),
      {
        params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('X-Astral-Media-Fallback')).toBe('missing-avatar');
  });

  it('supports HEAD placeholders when fallback=image is requested', async () => {
    const response = await HEAD(
      makeRequest('/api/avatars/file/missing-avatar.jpg?fallback=image'),
      {
        params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('X-Astral-Media-Fallback')).toBe('missing-avatar');
  });

  it('does not return image fallback placeholders for non-image avatar paths', async () => {
    const response = await GET(
      makeRequest('/api/avatars/file/missing-avatar.mp4?fallback=image'),
      {
        params: Promise.resolve({ slug: ['missing-avatar.mp4'] }),
      },
    );

    expect(response.status).toBe(404);
  });

  it('sets attachment content-disposition when download mode is requested', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_AVATARS = 'avatars';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(Buffer.from('avatar-object'), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': '12',
        },
      }),
    );

    const response = await GET(
      makeRequest('/api/avatars/file/missing-avatar.jpg?download=true'),
      {
        params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="missing-avatar.jpg"',
    );
  });

  it('treats quoted artifact endpoints as artifact hosts and prefers internal candidates', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = "'https://artifact.astralpirates.com/s3'";
    process.env.MEDIA_BUCKET_AVATARS = 'avatars';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('avatar-object'), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': '12',
          },
        }),
      );

    const response = await GET(makeRequest('/api/avatars/file/missing-avatar.jpg'), {
      params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://seaweedfs:8333/avatars/missing-avatar.jpg');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('skips malformed endpoint candidates and continues to internal fallbacks', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'not a url';
    process.env.MEDIA_BUCKET_AVATARS = 'avatars';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('avatar-object'), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': '12',
          },
        }),
      );

    const response = await GET(makeRequest('/api/avatars/file/missing-avatar.jpg'), {
      params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://seaweedfs:8333/avatars/missing-avatar.jpg');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('falls back to local avatar file when seaweed misses in seaweed mode', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_AVATARS = 'avatars';

    const avatarsDir = path.join(process.cwd(), 'public', 'media', 'avatars');
    const filename = `tomi-seaweed-fallback-${Date.now()}.jpg`;
    const filePath = path.join(avatarsDir, filename);
    const fileBuffer = Buffer.from('local-avatar-fallback');

    await fs.mkdir(avatarsDir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('missing', {
          status: 404,
          headers: {
            'Content-Type': 'application/xml',
          },
        }),
      );

    try {
      const response = await GET(makeRequest(`/api/avatars/file/${filename}`), {
        params: Promise.resolve({ slug: [filename] }),
      });

      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
      expect(response.headers.get('Content-Length')).toBe(String(fileBuffer.length));
      const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
      expect(body).toBe('local-avatar-fallback');
    } finally {
      await fs.rm(filePath, { force: true });
    }
  });
});
