import type { NextRequest } from 'next/server';

import type { GalleryImage } from '@/payload-types';
import {
  collectGalleryImageIdsFromPageLayout,
  normaliseGalleryImageId,
} from '@/src/lib/galleryReferences';
import { pruneGalleryReferencesBeforeDelete } from '@/src/collections/GalleryImages';
import {
  countActiveMediaReferencesForAsset,
} from '@/src/services/mediaLifecycle';

import { authenticateRequest } from '../../../_lib/auth';
import { corsEmpty, corsJson } from '../../../_lib/cors';
import { normaliseId } from '../../../_lib/flightPlanMembers';
import {
  loadGalleryImageForDelete,
  queueGalleryDeleteOrNoop,
} from '../../../_lib/galleryDeleteRoute';
import {
  isForceGalleryDeleteRequested,
} from '../../../_lib/galleryRouteShared';
import { resolveMediaModifyAccess } from '../../../_lib/mediaAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,DELETE';

type RouteParams = { params: Promise<{ id?: string | string[] }> };
type PageDoc = {
  layout?: unknown;
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function DELETE(req: NextRequest, context: RouteParams) {
  const { id } = await context.params;
  const auth = await authenticateRequest(req);
  const requestId = req.headers.get('x-request-id') ?? null;

  if (!auth.user) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[page-gallery-delete] blocked unauthenticated request',
    );
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const userId = normaliseId(auth.user.id);
  if (userId == null) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[page-gallery-delete] blocked request with non-numeric user id',
    );
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const rawId = Array.isArray(id) ? id[0] : id;
  const imageId = normaliseId(rawId);
  if (imageId == null) {
    return corsJson(req, { error: 'Image not found.' }, { status: 404 }, METHODS);
  }

  const forceDelete = isForceGalleryDeleteRequested(req.nextUrl.searchParams);

  try {
    const resolvedImage = await loadGalleryImageForDelete({
      req,
      payload: auth.payload,
      methods: METHODS,
      imageId,
    });
    if (!resolvedImage.ok) {
      return resolvedImage.response;
    }
    const image = resolvedImage.value as GalleryImage;

    const pageId = normaliseGalleryImageId((image as { page?: unknown }).page);
    let pageLayoutReferenced = false;
    if (pageId != null) {
      const modifyAccess = await resolveMediaModifyAccess({
        scope: 'page-gallery',
        payload: auth.payload as any,
        user: auth.user,
        pageId,
        adminMode: auth.adminMode,
      });
      if (!modifyAccess.allow) {
        auth.payload.logger.warn(
          {
            requestId,
            path: req.nextUrl.pathname,
            userId,
            pageId,
          },
          '[page-gallery-delete] blocked by access control',
        );
        return corsJson(
          req,
          {
            error:
              modifyAccess.status === 404
                ? 'Page not found.'
                : 'You do not have permission to remove this image.',
          },
          { status: modifyAccess.status },
          METHODS,
        );
      }
      const page = (modifyAccess.page ?? null) as PageDoc | null;
      if (page) {
        pageLayoutReferenced = collectGalleryImageIdsFromPageLayout(page.layout ?? []).includes(
          imageId,
        );
      }
    }

    const activeReferenceCount = await countActiveMediaReferencesForAsset({
      payload: auth.payload as any,
      assetClass: 'gallery',
      assetId: imageId,
    });
    if ((activeReferenceCount > 0 || pageLayoutReferenced) && !forceDelete) {
      return corsJson(
        req,
        {
          error:
            'Image is still referenced by the page carousel. Remove the slide and save the page before deleting the file, or retry with ?force=true.',
        },
        { status: 409 },
        METHODS,
      );
    }

    if (forceDelete) {
      await pruneGalleryReferencesBeforeDelete({
        id: imageId,
        req: {
          ...(req as any),
          ...auth,
          payload: auth.payload,
          user: auth.user,
          context: {},
        },
      } as any);
    }

    const queueResponse = await queueGalleryDeleteOrNoop({
      req,
      methods: METHODS,
      payload: auth.payload,
      imageId,
      forceDelete,
      reasonPrefix: 'page-gallery',
      requestedByUserId: userId,
    });
    if (queueResponse) {
      return queueResponse;
    }

    return corsEmpty(req, METHODS);
  } catch (error) {
    auth.payload.logger.error(
      { err: error, imageId, userId: auth.user.id },
      'Failed to queue page gallery image delete',
    );
    return corsJson(req, { error: 'Unable to remove the image.' }, { status: 500 }, METHODS);
  }
}
