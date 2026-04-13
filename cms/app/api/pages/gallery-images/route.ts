import type { NextRequest } from 'next/server';

import type { GalleryImage } from '@/payload-types';
import { authenticateRequest, buildRequestForUser } from '../../_lib/auth';
import { corsEmpty, corsJson } from '../../_lib/cors';
import { normaliseId } from '../../_lib/flightPlanMembers';
import {
  extractPublicGalleryUploadError,
  serializeGalleryImageAsset,
  summarizeGalleryUploadFile,
} from '../../_lib/galleryRouteShared';
import {
  parseGalleryUploadFormData,
  requireGalleryUploadFile,
  validateGalleryUploadInputFile,
} from '../../_lib/galleryUploadRoute';
import { isMediaAudioEnabled } from '../../_lib/mediaAudio';
import { resolveMediaModifyAccess } from '../../_lib/mediaAccess';
import { MEDIA_LIMITS_BYTES } from '@/src/storage/mediaConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = MEDIA_LIMITS_BYTES.gallery;
const METHODS = 'OPTIONS,POST';

const serializeGalleryImage = (doc: GalleryImage) => {
  const asset = serializeGalleryImageAsset(doc);
  return {
    ...asset,
    pageId: normaliseId((doc as { page?: unknown }).page),
  };
};

const isMissingGalleryPageColumnError = (error: unknown): boolean => {
  let cursor: unknown = error;
  for (let depth = 0; depth < 6 && cursor; depth += 1) {
    if (cursor instanceof Error) {
      const code =
        typeof (cursor as { code?: unknown }).code === 'string'
          ? ((cursor as { code?: string }).code ?? '').trim()
          : '';
      const message = cursor.message.toLowerCase();
      if (
        (code === '42703' || code === '42p01') &&
        (message.includes('page_id') || message.includes('gallery_images'))
      ) {
        return true;
      }
      cursor = (cursor as { cause?: unknown }).cause;
      continue;
    }
    if (cursor && typeof cursor === 'object') {
      cursor = (cursor as { cause?: unknown }).cause;
      continue;
    }
    break;
  }
  return false;
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const requestId = req.headers.get('x-request-id') ?? null;
  const currentUser = auth.user;

  if (!currentUser) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[page-gallery-upload] blocked unauthenticated request',
    );
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const currentUserId = currentUser.id ?? null;
  if (currentUserId == null) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[page-gallery-upload] blocked request with unresolved user id',
    );
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }
  const userId = normaliseId(currentUserId);
  if (userId == null) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[page-gallery-upload] blocked request with non-numeric user id',
    );
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const parsedFormData = await parseGalleryUploadFormData({
    req,
    payload: auth.payload,
    methods: METHODS,
    logTag: '[page-gallery-upload]',
    requestId,
    userId: currentUserId,
  });
  if (!parsedFormData.ok) {
    return parsedFormData.response;
  }
  const formData = parsedFormData.value;

  const parsedFile = requireGalleryUploadFile({
    req,
    payload: auth.payload,
    methods: METHODS,
    logTag: '[page-gallery-upload]',
    requestId,
    userId: currentUserId,
    formData,
  });
  if (!parsedFile.ok) {
    return parsedFile.response;
  }
  const file = parsedFile.value;

  const pageId = normaliseId(formData.get('pageId'));
  if (pageId == null) {
    return corsJson(req, { error: 'Valid pageId is required.' }, { status: 400 }, METHODS);
  }

  const modifyAccess = await resolveMediaModifyAccess({
    scope: 'page-gallery',
    payload: auth.payload as any,
    user: currentUser,
    pageId,
    adminMode: auth.adminMode,
  });
  if (!modifyAccess.allow) {
    auth.payload.logger.warn(
      {
        requestId,
        userId,
        path: req.nextUrl.pathname,
        pageId,
      },
      '[page-gallery-upload] blocked by access control',
    );
    return corsJson(
      req,
      {
        error:
          modifyAccess.status === 404
            ? 'Page not found.'
            : 'You do not have permission to upload media for this page.',
      },
      { status: modifyAccess.status },
      METHODS,
    );
  }

  const validatedFile = await validateGalleryUploadInputFile({
    req,
    payload: auth.payload,
    methods: METHODS,
    logTag: '[page-gallery-upload]',
    requestId,
    userId: currentUserId,
    file,
    maxFileSizeBytes: MAX_FILE_SIZE,
    allowAudio: isMediaAudioEnabled(),
    resourceContext: { pageId },
  });
  if (!validatedFile.ok) {
    return validatedFile.response;
  }
  const { buffer, mimeType } = validatedFile.value;

  try {
    const reqForUser = await buildRequestForUser(auth.payload, currentUser);
    const createUpload = async (includePageRelation: boolean) =>
      (await auth.payload.create({
        collection: 'gallery-images',
        data: {
          ...(includePageRelation ? { page: pageId } : {}),
          uploadedBy: userId,
        },
        draft: false,
        file: {
          data: buffer,
          mimetype: mimeType,
          size: buffer.length,
          name: file.name || 'page-gallery.jpg',
        },
        req: reqForUser,
        overrideAccess: true,
      })) as GalleryImage;

    let upload: GalleryImage;
    try {
      upload = await createUpload(true);
    } catch (createError) {
      if (!isMissingGalleryPageColumnError(createError)) {
        throw createError;
      }
      auth.payload.logger.warn(
        {
          err: createError,
          requestId,
          path: req.nextUrl.pathname,
          pageId,
          userId: currentUserId,
        },
        '[page-gallery-upload] gallery schema drift detected; retrying upload without page relation',
      );
      upload = await createUpload(false);
    }

    const asset = serializeGalleryImage(upload);
    if (!asset.url) {
      return corsJson(req, { error: 'Upload succeeded but the asset URL is missing.' }, { status: 500 }, METHODS);
    }

    return corsJson(
      req,
      {
        upload: {
          asset,
          imageUrl: asset.url,
        },
      },
      { status: 201 },
      METHODS,
    );
  } catch (error) {
    const publicUploadError = extractPublicGalleryUploadError(error);
    if (publicUploadError) {
      auth.payload.logger.warn(
        {
          err: error,
          requestId,
          path: req.nextUrl.pathname,
          pageId,
          userId: currentUserId,
          file: summarizeGalleryUploadFile(file),
        },
        '[page-gallery-upload] upload rejected by validation',
      );
      return corsJson(
        req,
        { error: publicUploadError.message },
        { status: publicUploadError.status },
        METHODS,
      );
    }

    auth.payload.logger.error(
      {
        err: error,
        requestId,
        path: req.nextUrl.pathname,
        pageId,
        userId: currentUserId,
        file: summarizeGalleryUploadFile(file),
      },
      '[page-gallery-upload] failed',
    );
    return corsJson(req, { error: 'Unable to upload media right now.' }, { status: 500 }, METHODS);
  }
}
