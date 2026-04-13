import path from 'node:path';
import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { GET, HEAD } from '@/app/api/gallery-images/file/[...slug]/route';

const galleryDir = path.join(process.cwd(), 'public', 'media', 'gallery');
const createdFiles = new Set<string>();
const originalEnv = {
  MEDIA_AUDIO_ENABLED: process.env.MEDIA_AUDIO_ENABLED,
  MEDIA_GOVERNANCE_ENFORCED: process.env.MEDIA_GOVERNANCE_ENFORCED,
  MEDIA_GOVERNANCE_MODE: process.env.MEDIA_GOVERNANCE_MODE,
  MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER,
  MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
  MEDIA_S3_INTERNAL_ENDPOINT: process.env.MEDIA_S3_INTERNAL_ENDPOINT,
  MEDIA_S3_REGION: process.env.MEDIA_S3_REGION,
  MEDIA_S3_ACCESS_KEY_ID: process.env.MEDIA_S3_ACCESS_KEY_ID,
  MEDIA_S3_SECRET_ACCESS_KEY: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
  MEDIA_BUCKET_GALLERY: process.env.MEDIA_BUCKET_GALLERY,
};

const makeRequest = (pathname: string, headers?: HeadersInit): NextRequest => {
  const parsed = new URL(pathname, 'https://astralpirates.com');
  return ({
    headers: new Headers(headers),
    nextUrl: {
      pathname: parsed.pathname,
      searchParams: parsed.searchParams,
    },
  }) as unknown as NextRequest;
};

afterEach(async () => {
  for (const filePath of createdFiles) {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup failures for already-removed files.
    }
  }
  createdFiles.clear();

  if (typeof originalEnv.MEDIA_STORAGE_PROVIDER === 'string') {
    process.env.MEDIA_STORAGE_PROVIDER = originalEnv.MEDIA_STORAGE_PROVIDER;
  } else {
    delete process.env.MEDIA_STORAGE_PROVIDER;
  }

  if (typeof originalEnv.MEDIA_AUDIO_ENABLED === 'string') {
    process.env.MEDIA_AUDIO_ENABLED = originalEnv.MEDIA_AUDIO_ENABLED;
  } else {
    delete process.env.MEDIA_AUDIO_ENABLED;
  }

  if (typeof originalEnv.MEDIA_GOVERNANCE_ENFORCED === 'string') {
    process.env.MEDIA_GOVERNANCE_ENFORCED = originalEnv.MEDIA_GOVERNANCE_ENFORCED;
  } else {
    delete process.env.MEDIA_GOVERNANCE_ENFORCED;
  }

  if (typeof originalEnv.MEDIA_GOVERNANCE_MODE === 'string') {
    process.env.MEDIA_GOVERNANCE_MODE = originalEnv.MEDIA_GOVERNANCE_MODE;
  } else {
    delete process.env.MEDIA_GOVERNANCE_MODE;
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

  if (typeof originalEnv.MEDIA_BUCKET_GALLERY === 'string') {
    process.env.MEDIA_BUCKET_GALLERY = originalEnv.MEDIA_BUCKET_GALLERY;
  } else {
    delete process.env.MEDIA_BUCKET_GALLERY;
  }

  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.MEDIA_AUDIO_ENABLED = 'true';
  delete process.env.MEDIA_GOVERNANCE_ENFORCED;
  delete process.env.MEDIA_GOVERNANCE_MODE;
});

describe('gallery file route', () => {
  it('returns 404 when file is missing', async () => {
    const response = await GET(makeRequest('/api/gallery-images/file/missing.glb'), {
      params: Promise.resolve({ slug: ['missing.glb'] }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('returns 404 for invalid relative paths', async () => {
    const response = await GET(makeRequest('/api/gallery-images/file/%2E%2E/evil.glb'), {
      params: Promise.resolve({ slug: ['..', 'evil.glb'] }),
    });

    expect(response.status).toBe(404);
  });

  it('serves an SVG placeholder when fallback=image is requested for a missing image', async () => {
    const response = await GET(
      makeRequest('/api/gallery-images/file/missing.webp?fallback=image'),
      {
        params: Promise.resolve({ slug: ['missing.webp'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('X-Astral-Media-Fallback')).toBe('missing-image');
  });

  it('supports HEAD placeholders when fallback=image is requested for a missing image', async () => {
    const response = await HEAD(
      makeRequest('/api/gallery-images/file/missing.webp?fallback=image'),
      {
        params: Promise.resolve({ slug: ['missing.webp'] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('X-Astral-Media-Fallback')).toBe('missing-image');
  });

  it('serves existing model files with model content type', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-model-${Date.now()}.glb`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('glb-stub'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/gallery-images/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
  });

  it('serves existing audio files with audio content type', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-audio-${Date.now()}.mp3`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('audio-stub'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/gallery-images/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
  });

  it('returns 404 for audio files when MEDIA_AUDIO_ENABLED is disabled', async () => {
    process.env.MEDIA_AUDIO_ENABLED = 'false';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-audio-disabled-${Date.now()}.mp3`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('audio-stub'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/gallery-images/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(404);
    expect(warnSpy).toHaveBeenCalledWith(
      '[gallery-audio-stream] request failed',
      expect.objectContaining({
        mediaType: 'audio',
        reason: 'audio-disabled',
        status: 404,
      }),
    );
  });

  it('supports HEAD for existing files', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-head-${Date.now()}.webm`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('webm-stub'));
    createdFiles.add(filePath);

    const response = await HEAD(makeRequest(`/api/gallery-images/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/webm');
    expect(response.headers.get('Content-Length')).toBeTruthy();
  });

  it('serves byte ranges for local files', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-range-${Date.now()}.mp3`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('0123456789abcdef'));
    createdFiles.add(filePath);

    const response = await GET(
      makeRequest(`/api/gallery-images/file/${filename}`, {
        Range: 'bytes=2-5',
      }),
      {
        params: Promise.resolve({ slug: [filename] }),
      },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/16');
    expect(response.headers.get('Content-Length')).toBe('4');
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
    expect(body).toBe('2345');
  });

  it('returns 416 for unsatisfiable local byte ranges', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-range-invalid-${Date.now()}.mp3`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('0123456789abcdef'));
    createdFiles.add(filePath);

    const response = await GET(
      makeRequest(`/api/gallery-images/file/${filename}`, {
        Range: 'bytes=100-200',
      }),
      {
        params: Promise.resolve({ slug: [filename] }),
      },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Range')).toBe('bytes */16');
    expect(warnSpy).toHaveBeenCalledWith(
      '[gallery-audio-stream] request failed',
      expect.objectContaining({
        mediaType: 'audio',
        reason: 'range-unsatisfiable',
        source: 'local',
        status: 416,
      }),
    );
  });

  it('sets attachment content-disposition when download mode is requested', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-download-${Date.now()}.glb`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('glb-download'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/gallery-images/file/${filename}?download=true`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${filename}"`);
  });

  it('falls back to numbered local variants when the exact filename is missing', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-fallback-${Date.now()}`;
    const fallbackFilename = `${filename}-1.glb`;
    const filePath = path.join(galleryDir, fallbackFilename);
    await fs.writeFile(filePath, Buffer.from('glb-fallback'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/gallery-images/file/${filename}.glb`), {
      params: Promise.resolve({ slug: [`${filename}.glb`] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary');
  });

  it('falls back to seaweed endpoint when local file is missing', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '13',
          },
        }),
      );

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://127.0.0.1:8333/gallery/mission.glb');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
  });

  it('forwards range headers to seaweed fetches', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('0123'), {
          status: 206,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': '4',
            'Content-Range': 'bytes 0-3/16',
            'Accept-Ranges': 'bytes',
          },
        }),
      );

    const response = await GET(
      makeRequest('/api/gallery-images/file/mission.mp3', {
        Range: 'bytes=0-3',
      }),
      {
        params: Promise.resolve({ slug: ['mission.mp3'] }),
      },
    );

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    const headers = (options?.headers ?? {}) as Record<string, string>;
    expect(String(request)).toBe('http://127.0.0.1:8333/gallery/mission.mp3');
    expect(headers.Range ?? headers.range).toBe('bytes=0-3');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-3/16');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('prefers seaweed object over local file when provider is seaweedfs', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    await fs.mkdir(galleryDir, { recursive: true });
    const filename = `vitest-gallery-seaweed-first-${Date.now()}.glb`;
    const filePath = path.join(galleryDir, filename);
    await fs.writeFile(filePath, Buffer.from('local-gallery-object'));
    createdFiles.add(filePath);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-gallery-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '21',
          },
        }),
      );

    const response = await GET(makeRequest(`/api/gallery-images/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('21');
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
    expect(body).toBe('seaweed-gallery-object');
  });

  it('falls back to numbered seaweed object keys when the primary key is missing', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl = String(input);
      if (requestUrl.includes('/mission-1.glb')) {
        return new Response(Buffer.from('seaweed-object-fallback'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '23',
          },
        });
      }
      return new Response('missing', {
        status: 404,
        headers: {
          'Content-Type': 'application/xml',
        },
      });
    });

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/gallery/mission.glb'))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/gallery/mission-1.glb'))).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary');
  });

  it('prefers internal seaweed endpoint candidates when configured endpoint is artifact host', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'https://artifact.astralpirates.com/s3';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '13',
          },
        }),
      );

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://seaweedfs:8333/gallery/mission.glb');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('treats quoted artifact endpoints as artifact hosts and still prefers internal candidates', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = "'https://artifact.astralpirates.com/s3'";
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '13',
          },
        }),
      );

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://seaweedfs:8333/gallery/mission.glb');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('skips malformed endpoint candidates and continues to internal fallbacks', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'not a url';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '13',
          },
        }),
      );

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://seaweedfs:8333/gallery/mission.glb');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('signs seaweed requests with SigV4 when credentials are present', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';
    process.env.MEDIA_S3_REGION = 'us-east-1';
    process.env.MEDIA_S3_ACCESS_KEY_ID = 'media-access-key';
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = 'media-secret-key';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '13',
          },
        }),
      );

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    const headers = (options?.headers ?? {}) as Record<string, string>;
    const authorization = headers.Authorization ?? headers.authorization;
    expect(String(request)).toBe('http://127.0.0.1:8333/gallery/mission.glb');
    expect(options?.method).toBe('GET');
    expect(authorization).toContain('AWS4-HMAC-SHA256');
    expect(authorization).toContain('Credential=media-access-key/');
    expect(headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(response.status).toBe(200);
  });

  it('falls back to AWS_* credentials and strips wrapping quotes', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_GALLERY = 'gallery';
    delete process.env.MEDIA_S3_REGION;
    delete process.env.MEDIA_S3_ACCESS_KEY_ID;
    delete process.env.MEDIA_S3_SECRET_ACCESS_KEY;
    process.env.AWS_REGION = '"us-east-1"';
    process.env.AWS_ACCESS_KEY_ID = '"media-access-key"';
    process.env.AWS_SECRET_ACCESS_KEY = "'media-secret-key'";

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-object'), {
          status: 200,
          headers: {
            'Content-Type': 'model/gltf-binary',
            'Content-Length': '13',
          },
        }),
      );

    const response = await GET(makeRequest('/api/gallery-images/file/mission.glb'), {
      params: Promise.resolve({ slug: ['mission.glb'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    const headers = (options?.headers ?? {}) as Record<string, string>;
    const authorization = headers.Authorization ?? headers.authorization;
    expect(String(request)).toBe('http://127.0.0.1:8333/gallery/mission.glb');
    expect(options?.method).toBe('GET');
    expect(authorization).toContain('Credential=media-access-key/');
    expect(authorization).toContain('/us-east-1/s3/aws4_request');
    expect(response.status).toBe(200);
  });
});
