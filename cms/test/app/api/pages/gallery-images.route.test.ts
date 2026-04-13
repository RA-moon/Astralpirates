import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(),
}));

vi.mock('@/app/api/_lib/pageEditorAccess', () => ({
  resolvePageEditAccess: vi.fn(),
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

import { POST as uploadPageGalleryImage } from '@/app/api/pages/gallery-images/route';
import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { resolvePageEditAccess } from '@/app/api/_lib/pageEditorAccess';
import { validateGalleryUploadFile } from '@/src/storage/galleryUploadValidation';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedBuildRequestForUser = vi.mocked(buildRequestForUser);
const mockedResolvePageEditAccess = vi.mocked(resolvePageEditAccess);
const mockedValidateGalleryUploadFile = vi.mocked(validateGalleryUploadFile);

const makePostRequest = (formData: FormData) =>
  ({
    headers: new Headers(),
    nextUrl: { pathname: '/api/pages/gallery-images' },
    formData: async () => formData,
  }) as unknown as NextRequest;

describe('page gallery upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolvePageEditAccess.mockResolvedValue({
      page: { id: 44 },
      canEdit: true,
    } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
  });

  it('logs and returns 401 for unauthenticated upload requests', async () => {
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

    const response = await uploadPageGalleryImage(makePostRequest(new FormData()));
    expect(response.status).toBe(401);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/pages/gallery-images' }),
      '[page-gallery-upload] blocked unauthenticated request',
    );
  });

  it('logs and returns 403 when user lacks page-upload role access', async () => {
    const payload = {
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
      page: { id: 44 },
      canEdit: false,
    } as any);

    const formData = new FormData();
    formData.set('pageId', '44');
    formData.set('file', new File(['stub'], 'upload.jpg', { type: 'image/jpeg' }));
    const response = await uploadPageGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(403);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 17,
        pageId: 44,
        path: '/api/pages/gallery-images',
      }),
      '[page-gallery-upload] blocked by access control',
    );
  });

  it('retries without page relation when gallery page_id column is missing', async () => {
    const schemaDriftError = Object.assign(new Error('column "page_id" does not exist'), {
      code: '42703',
    });
    const payload = {
      findByID: vi.fn().mockResolvedValue({ id: 44 }),
      create: vi
        .fn()
        .mockRejectedValueOnce(schemaDriftError)
        .mockResolvedValueOnce({
          id: 88,
          url: '/media/gallery/recovered-upload.jpg',
          filename: 'recovered-upload.jpg',
          mimeType: 'image/jpeg',
          filesize: 1234,
          width: 1920,
          height: 1080,
          sizes: {
            preview: {
              width: 1600,
              height: 900,
              url: '/media/gallery/recovered-upload.jpg',
            },
            thumbnail: {
              width: 320,
              height: 180,
              url: '/media/gallery/recovered-upload-thumb.jpg',
            },
          },
        }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedValidateGalleryUploadFile.mockResolvedValue({
      buffer: Buffer.from('stub'),
      mimeType: 'image/jpeg',
    } as any);

    const formData = new FormData();
    formData.set('pageId', '44');
    formData.set('file', new File(['stub'], 'upload.jpg', { type: 'image/jpeg' }));

    const response = await uploadPageGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body?.upload?.imageUrl).toBe('/api/gallery-images/file/recovered-upload.jpg');
    expect(payload.create).toHaveBeenCalledTimes(2);
    expect(payload.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          page: 44,
          uploadedBy: 17,
        },
      }),
    );
    expect(payload.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          uploadedBy: 17,
        },
      }),
    );
    expect(payload.create.mock.calls[0]?.[0]?.req).toBeDefined();
    expect(payload.create.mock.calls[1]?.[0]?.req).toBeDefined();
  });

  it('returns 500 when upload creation fails for non-schema errors', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ id: 44 }),
      create: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedValidateGalleryUploadFile.mockResolvedValue({
      buffer: Buffer.from('stub'),
      mimeType: 'image/jpeg',
    } as any);

    const formData = new FormData();
    formData.set('pageId', '44');
    formData.set('file', new File(['stub'], 'upload.jpg', { type: 'image/jpeg' }));

    const response = await uploadPageGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(500);
    expect(payload.create).toHaveBeenCalledTimes(1);
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
      findByID: vi.fn().mockResolvedValue({ id: 44 }),
      create: vi.fn().mockRejectedValue(payloadValidationError),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedValidateGalleryUploadFile.mockResolvedValue({
      buffer: Buffer.from('stub'),
      mimeType: 'model/obj',
    } as any);

    const formData = new FormData();
    formData.set('pageId', '44');
    formData.set('file', new File(['stub'], 'upload.obj', { type: 'text/plain' }));

    const response = await uploadPageGalleryImage(makePostRequest(formData));
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
        create: vi.fn().mockResolvedValue({
          id: 88,
          url: '/media/gallery/upload.jpg',
          filename: 'upload.jpg',
          mimeType: 'image/jpeg',
          filesize: 1234,
          width: 1920,
          height: 1080,
          sizes: {
            preview: {
              width: 1600,
              height: 900,
              url: '/media/gallery/upload.jpg',
            },
            thumbnail: {
              width: 320,
              height: 180,
              url: '/media/gallery/upload-thumb.jpg',
            },
          },
        }),
        logger: {
          warn: vi.fn(),
          error: vi.fn(),
        },
      };
      mockedAuthenticateRequest.mockResolvedValue({
        payload,
        user: { id: 17, role: 'captain' },
      } as any);
      mockedValidateGalleryUploadFile.mockResolvedValue({
        buffer: Buffer.from('stub'),
        mimeType: 'image/jpeg',
      } as any);

      const formData = new FormData();
      formData.set('pageId', '44');
      formData.set('file', new File(['stub'], 'upload.jpg', { type: 'image/jpeg' }));

      const response = await uploadPageGalleryImage(makePostRequest(formData));
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
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 17, role: 'captain' },
    } as any);
    mockedValidateGalleryUploadFile.mockRejectedValue(
      new Error('Audio uploads are currently disabled.'),
    );

    const formData = new FormData();
    formData.set('pageId', '44');
    formData.set('file', new File(['stub'], 'briefing.mp3', { type: 'audio/mpeg' }));

    const response = await uploadPageGalleryImage(makePostRequest(formData));
    expect(response.status).toBe(400);
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({
          inferredMimeType: 'audio/mpeg',
          mediaType: 'audio',
          isAudioMedia: true,
        }),
      }),
      '[page-gallery-upload] file validation failed',
    );
  });
});
