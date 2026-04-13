import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';

import { GET as getApiAvatar } from '@/app/api/avatars/file/[...slug]/route';
import { GET as getMediaAvatar, HEAD as headMediaAvatar } from '@/app/media/avatars/[...slug]/route';

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

describe('/media/avatars route parity', () => {
  it('returns the same not-found payload shape as /api/avatars/file', async () => {
    const apiResponse = await getApiAvatar(makeRequest('/api/avatars/file/missing-avatar.jpg'), {
      params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
    });
    const mediaResponse = await getMediaAvatar(makeRequest('/media/avatars/missing-avatar.jpg'), {
      params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
    });

    expect(mediaResponse.status).toBe(apiResponse.status);
    expect(mediaResponse.headers.get('Content-Type')).toBe(apiResponse.headers.get('Content-Type'));
    expect(await mediaResponse.text()).toBe(await apiResponse.text());
  });

  it('supports HEAD for missing files with 404 status', async () => {
    const response = await headMediaAvatar(makeRequest('/media/avatars/missing-avatar.jpg'), {
      params: Promise.resolve({ slug: ['missing-avatar.jpg'] }),
    });
    expect(response.status).toBe(404);
  });
});
