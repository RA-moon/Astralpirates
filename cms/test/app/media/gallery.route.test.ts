import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';

import { GET as getApiGallery } from '@/app/api/gallery-images/file/[...slug]/route';
import { GET as getMediaGallery, HEAD as headMediaGallery } from '@/app/media/gallery/[...slug]/route';

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

describe('/media/gallery route parity', () => {
  it('returns the same not-found payload shape as /api/gallery-images/file', async () => {
    const apiResponse = await getApiGallery(makeRequest('/api/gallery-images/file/missing-image.jpg'), {
      params: Promise.resolve({ slug: ['missing-image.jpg'] }),
    });
    const mediaResponse = await getMediaGallery(makeRequest('/media/gallery/missing-image.jpg'), {
      params: Promise.resolve({ slug: ['missing-image.jpg'] }),
    });

    expect(mediaResponse.status).toBe(apiResponse.status);
    expect(mediaResponse.headers.get('Content-Type')).toBe(apiResponse.headers.get('Content-Type'));
    expect(await mediaResponse.text()).toBe(await apiResponse.text());
  });

  it('supports HEAD for missing files with 404 status', async () => {
    const response = await headMediaGallery(makeRequest('/media/gallery/missing-image.jpg'), {
      params: Promise.resolve({ slug: ['missing-image.jpg'] }),
    });
    expect(response.status).toBe(404);
  });
});
