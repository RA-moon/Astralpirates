import path from 'node:path';
import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { GET, HEAD } from '@/app/api/task-attachments/file/[...slug]/route';

const tasksDir = path.join(process.cwd(), 'public', 'media', 'tasks');
const createdFiles = new Set<string>();
const originalEnv = {
  MEDIA_GOVERNANCE_ENFORCED: process.env.MEDIA_GOVERNANCE_ENFORCED,
  MEDIA_GOVERNANCE_MODE: process.env.MEDIA_GOVERNANCE_MODE,
  MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER,
  MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
  MEDIA_S3_INTERNAL_ENDPOINT: process.env.MEDIA_S3_INTERNAL_ENDPOINT,
  MEDIA_BUCKET_TASKS: process.env.MEDIA_BUCKET_TASKS,
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
  delete process.env.MEDIA_GOVERNANCE_ENFORCED;
  delete process.env.MEDIA_GOVERNANCE_MODE;
});

afterEach(async () => {
  for (const filePath of createdFiles) {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup failures for already-removed files.
    }
  }
  createdFiles.clear();

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

  if (typeof originalEnv.MEDIA_BUCKET_TASKS === 'string') {
    process.env.MEDIA_BUCKET_TASKS = originalEnv.MEDIA_BUCKET_TASKS;
  } else {
    delete process.env.MEDIA_BUCKET_TASKS;
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

describe('task attachments file route', () => {
  it('returns 404 when file is missing', async () => {
    const response = await GET(makeRequest('/api/task-attachments/file/missing.pdf'), {
      params: Promise.resolve({ slug: ['missing.pdf'] }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('returns 404 for invalid relative paths', async () => {
    const response = await GET(makeRequest('/api/task-attachments/file/%2E%2E/evil.pdf'), {
      params: Promise.resolve({ slug: ['..', 'evil.pdf'] }),
    });

    expect(response.status).toBe(404);
  });

  it('serves existing local files', async () => {
    await fs.mkdir(tasksDir, { recursive: true });
    const filename = `vitest-task-${Date.now()}.pdf`;
    const filePath = path.join(tasksDir, filename);
    await fs.writeFile(filePath, Buffer.from('task-attachment-stub'));
    createdFiles.add(filePath);

    const response = await GET(makeRequest(`/api/task-attachments/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
  });

  it('supports HEAD for existing local files', async () => {
    await fs.mkdir(tasksDir, { recursive: true });
    const filename = `vitest-task-head-${Date.now()}.txt`;
    const filePath = path.join(tasksDir, filename);
    await fs.writeFile(filePath, Buffer.from('task-head-stub'));
    createdFiles.add(filePath);

    const response = await HEAD(makeRequest(`/api/task-attachments/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Content-Length')).toBeTruthy();
  });

  it('sets attachment content-disposition when download mode is requested', async () => {
    await fs.mkdir(tasksDir, { recursive: true });
    const filename = `vitest-task-download-${Date.now()}.pdf`;
    const filePath = path.join(tasksDir, filename);
    await fs.writeFile(filePath, Buffer.from('task-download-stub'));
    createdFiles.add(filePath);

    const response = await GET(
      makeRequest(`/api/task-attachments/file/${filename}?download=1`),
      {
        params: Promise.resolve({ slug: [filename] }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${filename}"`);
  });

  it('falls back to seaweed endpoint when local file is missing', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_TASKS = 'tasks';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-task-object'), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': '19',
          },
        }),
      );

    const response = await GET(makeRequest('/api/task-attachments/file/mission-note.pdf'), {
      params: Promise.resolve({ slug: ['mission-note.pdf'] }),
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe('http://127.0.0.1:8333/tasks/mission-note.pdf');
    expect(options?.method).toBe('GET');
    expect(options?.headers).toBeUndefined();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('prefers seaweed object over local file when provider is seaweedfs', async () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'seaweedfs';
    process.env.MEDIA_S3_ENDPOINT = 'http://127.0.0.1:8333';
    process.env.MEDIA_BUCKET_TASKS = 'tasks';

    await fs.mkdir(tasksDir, { recursive: true });
    const filename = `vitest-task-seaweed-first-${Date.now()}.pdf`;
    const filePath = path.join(tasksDir, filename);
    await fs.writeFile(filePath, Buffer.from('local-task-object'));
    createdFiles.add(filePath);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('seaweed-task-object'), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': '19',
          },
        }),
      );

    const response = await GET(makeRequest(`/api/task-attachments/file/${filename}`), {
      params: Promise.resolve({ slug: [filename] }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('19');
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
    expect(body).toBe('seaweed-task-object');
  });
});
