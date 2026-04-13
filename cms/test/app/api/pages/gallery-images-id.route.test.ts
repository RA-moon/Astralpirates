import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/pageEditorAccess', () => ({
  resolvePageEditAccess: vi.fn(),
}));

import { DELETE as deletePageGalleryImage } from '@/app/api/pages/gallery-images/[id]/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import { resolvePageEditAccess } from '@/app/api/_lib/pageEditorAccess';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedResolvePageEditAccess = vi.mocked(resolvePageEditAccess);

const makeDeleteRequest = (force = false) =>
  ({
    headers: new Headers(),
    nextUrl: {
      pathname: '/api/pages/gallery-images/91',
      searchParams: new URLSearchParams(force ? 'force=true' : ''),
    },
  }) as unknown as NextRequest;

describe('page gallery image delete route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolvePageEditAccess.mockResolvedValue({
      page: { id: 44, layout: [] },
      canEdit: true,
    } as any);
  });

  it('logs and returns 401 for unauthenticated delete requests', async () => {
    const payload = {
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: null,
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(401);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/pages/gallery-images/91' }),
      '[page-gallery-delete] blocked unauthenticated request',
    );
  });

  it('logs and returns 403 when delete role access is denied', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 91,
        page: 44,
      }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'passenger' },
    } as any);
    mockedResolvePageEditAccess.mockResolvedValue({
      page: { id: 44, layout: [] },
      canEdit: false,
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(403);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 17,
        pageId: 44,
        path: '/api/pages/gallery-images/91',
      }),
      '[page-gallery-delete] blocked by access control',
    );
  });

  it('returns 409 when image is still referenced by a page carousel slide', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 91,
        page: 44,
      }),
      delete: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedResolvePageEditAccess.mockResolvedValue({
      page: {
        id: 44,
        layout: [
          {
            blockType: 'imageCarousel',
            slides: [{ galleryImage: 91 }],
          },
        ],
      },
      canEdit: true,
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(409);
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it('deletes image when it is no longer referenced', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 91,
        page: 44,
      }),
      delete: vi.fn().mockResolvedValue({ id: 91 }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedResolvePageEditAccess.mockResolvedValue({
      page: {
        id: 44,
        layout: [
          {
            blockType: 'imageCarousel',
            slides: [{ galleryImage: 73 }],
          },
        ],
      },
      canEdit: true,
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(204);
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'gallery-images',
        id: 91,
      }),
    );
  });

  it('deletes image when force mode is enabled even if referenced', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 91,
        page: 44,
      }),
      delete: vi.fn().mockResolvedValue({ id: 91 }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedResolvePageEditAccess.mockResolvedValue({
      page: {
        id: 44,
        layout: [
          {
            blockType: 'imageCarousel',
            slides: [{ galleryImage: 91 }],
          },
        ],
      },
      canEdit: true,
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(true), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(204);
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'gallery-images',
        id: 91,
      }),
    );
  });

  it('treats missing gallery images as already deleted', async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 })),
      delete: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(204);
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.logger.error).not.toHaveBeenCalled();
  });

  it('returns success when delete races with another requester', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 91,
        page: 44,
      }),
      delete: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 })),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedResolvePageEditAccess.mockResolvedValue({
      page: {
        id: 44,
        layout: [],
      },
      canEdit: true,
    } as any);

    const response = await deletePageGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(204);
    expect(payload.logger.error).not.toHaveBeenCalled();
  });
});
