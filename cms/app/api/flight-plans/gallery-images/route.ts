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
    flightPlanId: normaliseId(doc.flightPlan),
  };
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const requestId = req.headers.get('x-request-id') ?? null;

  if (!auth.user) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[gallery-upload] blocked unauthenticated request',
    );
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const parsedFormData = await parseGalleryUploadFormData({
    req,
    payload: auth.payload,
    methods: METHODS,
    logTag: '[gallery-upload]',
    requestId,
    userId: auth.user.id,
  });
  if (!parsedFormData.ok) {
    return parsedFormData.response;
  }
  const formData = parsedFormData.value;

  const parsedFile = requireGalleryUploadFile({
    req,
    payload: auth.payload,
    methods: METHODS,
    logTag: '[gallery-upload]',
    requestId,
    userId: auth.user.id,
    formData,
  });
  if (!parsedFile.ok) {
    return parsedFile.response;
  }
  const file = parsedFile.value;

  const flightPlanId = normaliseId(formData.get('flightPlanId'));
  if (flightPlanId == null) {
    auth.payload.logger.warn(
      {
        requestId,
        userId: auth.user.id,
        path: req.nextUrl.pathname,
        flightPlanId: formData.get('flightPlanId'),
        file: summarizeGalleryUploadFile(file),
      },
      '[gallery-upload] invalid flightPlanId value',
    );
    return corsJson(req, { error: 'Valid flightPlanId is required.' }, { status: 400 }, METHODS);
  }

  let ownerId: number | null = null;
  try {
    const flightPlan = await auth.payload.findByID({
      collection: 'flight-plans',
      id: flightPlanId,
      depth: 0,
      overrideAccess: true,
    });
    ownerId = normaliseId((flightPlan as { owner?: unknown }).owner);
  } catch {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const modifyAccess = await resolveMediaModifyAccess({
    scope: 'flight-plan-gallery',
    payload: auth.payload as any,
    user: auth.user,
    flightPlanId,
    ownerIdHint: ownerId ?? undefined,
    adminMode: auth.adminMode,
  });
  if (!modifyAccess.allow) {
    auth.payload.logger.warn(
      { requestId, userId: auth.user.id, path: req.nextUrl.pathname, flightPlanId },
      '[gallery-upload] blocked by access control',
    );
    return corsJson(
      req,
      { error: 'You do not have permission to upload media for this mission.' },
      { status: modifyAccess.status },
      METHODS,
    );
  }

  const validatedFile = await validateGalleryUploadInputFile({
    req,
    payload: auth.payload,
    methods: METHODS,
    logTag: '[gallery-upload]',
    requestId,
    userId: auth.user.id,
    file,
    maxFileSizeBytes: MAX_FILE_SIZE,
    allowAudio: isMediaAudioEnabled(),
    resourceContext: { flightPlanId },
  });
  if (!validatedFile.ok) {
    return validatedFile.response;
  }
  const { buffer, mimeType } = validatedFile.value;

  try {
    const reqForUser = await buildRequestForUser(auth.payload, auth.user);
    const upload = (await auth.payload.create({
      collection: 'gallery-images',
      data: {
        flightPlan: flightPlanId,
        uploadedBy: auth.user.id,
      },
      draft: false,
      file: {
        data: buffer,
        mimetype: mimeType,
        size: buffer.length,
        name: file.name || 'mission-gallery.jpg',
      },
      req: reqForUser,
      overrideAccess: true,
    })) as GalleryImage;

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
          flightPlanId,
          userId: auth.user.id,
          file: summarizeGalleryUploadFile(file),
        },
        '[gallery-upload] upload rejected by validation',
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
        flightPlanId,
        userId: auth.user.id,
        file: summarizeGalleryUploadFile(file),
      },
      'Failed to upload mission gallery media',
    );
    return corsJson(req, { error: 'Unable to upload media right now.' }, { status: 500 }, METHODS);
  }
}
