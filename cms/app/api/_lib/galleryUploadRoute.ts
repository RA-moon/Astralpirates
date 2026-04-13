import type { NextRequest } from 'next/server';

import {
  GalleryUploadValidationError,
  validateGalleryUploadFile,
} from '@/src/storage/galleryUploadValidation';

import { corsJson } from './cors';
import { summarizeGalleryUploadFile } from './galleryRouteShared';

type PayloadLike = {
  logger?: {
    warn?: (meta: Record<string, unknown>, message: string) => void;
  };
};

type RouteResult<T> = { ok: true; value: T } | { ok: false; response: Response };

export const parseGalleryUploadFormData = async ({
  req,
  payload,
  methods,
  logTag,
  requestId,
  userId,
}: {
  req: NextRequest;
  payload: PayloadLike;
  methods: string;
  logTag: string;
  requestId: string | null;
  userId: unknown;
}): Promise<RouteResult<FormData>> => {
  try {
    return { ok: true, value: await req.formData() };
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, requestId, userId, path: req.nextUrl.pathname },
      `${logTag} invalid multipart form data`,
    );
    return {
      ok: false,
      response: corsJson(req, { error: 'Invalid form data.' }, { status: 400 }, methods),
    };
  }
};

export const requireGalleryUploadFile = ({
  req,
  payload,
  methods,
  logTag,
  requestId,
  userId,
  formData,
}: {
  req: NextRequest;
  payload: PayloadLike;
  methods: string;
  logTag: string;
  requestId: string | null;
  userId: unknown;
  formData: FormData;
}): RouteResult<File> => {
  const file = formData.get('file');
  if (file instanceof File) {
    return { ok: true, value: file };
  }

  payload.logger?.warn?.(
    {
      requestId,
      userId,
      path: req.nextUrl.pathname,
      file: summarizeGalleryUploadFile(file),
    },
    `${logTag} missing file payload`,
  );
  return {
    ok: false,
    response: corsJson(req, { error: 'Media file is required.' }, { status: 400 }, methods),
  };
};

export const validateGalleryUploadInputFile = async ({
  req,
  payload,
  methods,
  logTag,
  requestId,
  userId,
  file,
  maxFileSizeBytes,
  allowAudio,
  resourceContext,
}: {
  req: NextRequest;
  payload: PayloadLike;
  methods: string;
  logTag: string;
  requestId: string | null;
  userId: unknown;
  file: File;
  maxFileSizeBytes: number;
  allowAudio: boolean;
  resourceContext?: Record<string, unknown>;
}): Promise<RouteResult<{ buffer: Buffer<ArrayBufferLike>; mimeType: string }>> => {
  try {
    const result = await validateGalleryUploadFile({
      file,
      maxFileSizeBytes,
      allowAudio,
    });
    return { ok: true, value: result };
  } catch (validationError) {
    const error = validationError as Error;
    const status =
      validationError instanceof GalleryUploadValidationError ? validationError.status : 400;
    payload.logger?.warn?.(
      {
        requestId,
        userId,
        path: req.nextUrl.pathname,
        ...(resourceContext ?? {}),
        file: summarizeGalleryUploadFile(file),
        error: error.message,
      },
      `${logTag} file validation failed`,
    );
    return {
      ok: false,
      response: corsJson(req, { error: error.message }, { status }, methods),
    };
  }
};
