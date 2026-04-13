import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';

import { GET as getApiTaskAttachment } from '@/app/api/task-attachments/file/[...slug]/route';
import { GET as getMediaTaskAttachment, HEAD as headMediaTaskAttachment } from '@/app/media/tasks/[...slug]/route';

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

describe('/media/tasks route parity', () => {
  it('returns the same not-found payload shape as /api/task-attachments/file', async () => {
    const apiResponse = await getApiTaskAttachment(
      makeRequest('/api/task-attachments/file/missing-attachment.pdf'),
      {
        params: Promise.resolve({ slug: ['missing-attachment.pdf'] }),
      },
    );
    const mediaResponse = await getMediaTaskAttachment(
      makeRequest('/media/tasks/missing-attachment.pdf'),
      {
        params: Promise.resolve({ slug: ['missing-attachment.pdf'] }),
      },
    );

    expect(mediaResponse.status).toBe(apiResponse.status);
    expect(mediaResponse.headers.get('Content-Type')).toBe(apiResponse.headers.get('Content-Type'));
    expect(await mediaResponse.text()).toBe(await apiResponse.text());
  });

  it('supports HEAD for missing files with 404 status', async () => {
    const response = await headMediaTaskAttachment(
      makeRequest('/media/tasks/missing-attachment.pdf'),
      {
        params: Promise.resolve({ slug: ['missing-attachment.pdf'] }),
      },
    );
    expect(response.status).toBe(404);
  });
});
