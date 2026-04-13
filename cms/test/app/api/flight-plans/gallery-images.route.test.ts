import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(),
}));

vi.mock('@/src/storage/galleryUploadValidation', () => ({
  GalleryUploadValidationError: class GalleryUploadValidationError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  validateGalleryUploadFile: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    canEditFlightPlan: vi.fn(),
  };
});

import { POST as uploadFlightPlanGalleryImage } from '@/app/api/flight-plans/gallery-images/route';
import { DELETE as deleteFlightPlanGalleryImage } from '@/app/api/flight-plans/gallery-images/[id]/route';
import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { canEditFlightPlan } from '@/app/api/_lib/flightPlanMembers';
import { validateGalleryUploadFile } from '@/src/storage/galleryUploadValidation';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedBuildRequestForUser = vi.mocked(buildRequestForUser);
const mockedCanEditFlightPlan = vi.mocked(canEditFlightPlan);
const mockedValidateGalleryUploadFile = vi.mocked(validateGalleryUploadFile);

const makePostRequest = (formData: FormData) =>
  ({
    headers: new Headers(),
    nextUrl: { pathname: '/api/flight-plans/gallery-images' },
    formData: async () => formData,
  }) as unknown as NextRequest;

const makeDeleteRequest = (force = false) =>
  ({
    headers: new Headers(),
    nextUrl: {
      pathname: '/api/flight-plans/gallery-images/91',
      searchParams: new URLSearchParams(force ? 'force=true' : ''),
    },
  }) as unknown as NextRequest;

describe('flight plan gallery image routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBuildRequestForUser.mockResolvedValue({} as any);
  });

  it('logs and returns 401 for unauthenticated mission gallery delete requests', async () => {
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

    const response = await deleteFlightPlanGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(401);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/flight-plans/gallery-images/91' }),
      '[gallery-delete] blocked unauthenticated request',
    );
  });

  it('passes owner hint to access checks when uploading mission gallery files', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 44,
        owner: { id: 5 },
      }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(false);

    const formData = new FormData();
    formData.set('flightPlanId', '44');
    formData.set('file', new File(['stub'], 'mission.jpg', { type: 'image/jpeg' }));

    const response = await uploadFlightPlanGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(403);
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plans',
        id: 44,
      }),
    );
    expect(mockedCanEditFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        flightPlanId: 44,
        userId: 17,
        ownerIdHint: 5,
      }),
    );
  });

  it('passes owner hint to access checks when deleting mission gallery files', async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValueOnce({
          id: 91,
          flightPlan: 44,
        })
        .mockResolvedValueOnce({
          id: 44,
          owner: { id: 5 },
          gallerySlides: [],
        }),
      delete: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(false);

    const response = await deleteFlightPlanGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });
    expect(response.status).toBe(403);
    expect(mockedCanEditFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        flightPlanId: 44,
        userId: 17,
        ownerIdHint: 5,
      }),
    );
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 17,
        flightPlanId: 44,
        path: '/api/flight-plans/gallery-images/91',
      }),
      '[gallery-delete] blocked by access control',
    );
  });

  it('returns 409 when image is still referenced and force mode is not enabled', async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValueOnce({
          id: 91,
          flightPlan: 44,
        })
        .mockResolvedValueOnce({
          id: 44,
          owner: { id: 5 },
          gallerySlides: [{ galleryImage: 91 }],
        }),
      delete: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await deleteFlightPlanGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(409);
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it('deletes referenced image when force mode is enabled', async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValueOnce({
          id: 91,
          flightPlan: 44,
        })
        .mockResolvedValueOnce({
          id: 44,
          owner: { id: 5 },
          gallerySlides: [{ galleryImage: 91 }],
        }),
      delete: vi.fn().mockResolvedValue({ id: 91 }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await deleteFlightPlanGalleryImage(makeDeleteRequest(true), {
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
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await deleteFlightPlanGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(204);
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.logger.error).not.toHaveBeenCalled();
  });

  it('returns success when delete races with another requester', async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValueOnce({
          id: 91,
          flightPlan: 44,
        })
        .mockResolvedValueOnce({
          id: 44,
          owner: { id: 5 },
          gallerySlides: [],
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
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await deleteFlightPlanGalleryImage(makeDeleteRequest(), {
      params: Promise.resolve({ id: '91' }),
    });

    expect(response.status).toBe(204);
    expect(payload.logger.error).not.toHaveBeenCalled();
  });

  it('returns public payload validation errors from upload creation as 4xx', async () => {
    const payloadValidationError = Object.assign(
      new Error('The following field is invalid: file'),
      {
        status: 400,
        isPublic: true,
        data: {
          errors: [
            {
              message: 'File type text/plain (from extension obj) is not allowed.',
              path: 'file',
            },
          ],
        },
      },
    );
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 44,
        owner: { id: 5 },
      }),
      create: vi.fn().mockRejectedValue(payloadValidationError),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);
    mockedValidateGalleryUploadFile.mockResolvedValue({
      buffer: Buffer.from('stub'),
      mimeType: 'model/obj',
    } as any);

    const formData = new FormData();
    formData.set('flightPlanId', '44');
    formData.set('file', new File(['stub'], 'mission.obj', { type: 'text/plain' }));

    const response = await uploadFlightPlanGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'File type text/plain (from extension obj) is not allowed.',
    });
    expect(payload.create).toHaveBeenCalledTimes(1);
  });

  it('passes MEDIA_AUDIO_ENABLED=false into upload validation options', async () => {
    const previousAudioEnv = process.env.MEDIA_AUDIO_ENABLED;
    process.env.MEDIA_AUDIO_ENABLED = 'false';

    try {
      const payload = {
        findByID: vi.fn().mockResolvedValue({
          id: 44,
          owner: { id: 5 },
        }),
        create: vi.fn().mockResolvedValue({
          id: 91,
          filename: 'mission.jpg',
          mimeType: 'image/jpeg',
          filesize: 42,
          width: 1,
          height: 1,
          url: '/media/gallery/mission.jpg',
        }),
        logger: {
          warn: vi.fn(),
          error: vi.fn(),
        },
      };
      mockedAuthenticateRequest.mockResolvedValue({
        payload,
        user: { id: 17 },
      } as any);
      mockedCanEditFlightPlan.mockResolvedValue(true);
      mockedValidateGalleryUploadFile.mockResolvedValue({
        buffer: Buffer.from('stub'),
        mimeType: 'image/jpeg',
      } as any);

      const formData = new FormData();
      formData.set('flightPlanId', '44');
      formData.set('file', new File(['stub'], 'mission.jpg', { type: 'image/jpeg' }));

      const response = await uploadFlightPlanGalleryImage(makePostRequest(formData));
      expect(response.status).toBe(201);
      expect(mockedValidateGalleryUploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          allowAudio: false,
        }),
      );
    } finally {
      if (typeof previousAudioEnv === 'string') {
        process.env.MEDIA_AUDIO_ENABLED = previousAudioEnv;
      } else {
        delete process.env.MEDIA_AUDIO_ENABLED;
      }
    }
  });

  it('logs audio telemetry fields when upload validation fails', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 44,
        owner: { id: 5 },
      }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17 },
    } as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);
    mockedValidateGalleryUploadFile.mockRejectedValue(
      new Error('Audio uploads are currently disabled.'),
    );

    const formData = new FormData();
    formData.set('flightPlanId', '44');
    formData.set('file', new File(['stub'], 'briefing.mp3', { type: 'audio/mpeg' }));

    const response = await uploadFlightPlanGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(400);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({
          inferredMimeType: 'audio/mpeg',
          mediaType: 'audio',
          isAudioMedia: true,
        }),
      }),
      '[gallery-upload] file validation failed',
    );
  });
});
