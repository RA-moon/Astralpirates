import type { NextRequest } from 'next/server';

import type { GalleryImage } from '@/payload-types';
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
import { collectSlideGalleryImageIds } from '../../../_lib/gallery';
import {
  isForceGalleryDeleteRequested,
} from '../../../_lib/galleryRouteShared';
import { resolveMediaModifyAccess } from '../../../_lib/mediaAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,DELETE';

type RouteParams = { params: Promise<{ id?: string | string[] }> };
type FlightPlanAccessContext = {
  owner?: unknown;
  gallerySlides?: unknown;
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function DELETE(
  req: NextRequest,
  context: RouteParams,
) {
  const { id } = await context.params;
  const auth = await authenticateRequest(req);
  const requestId = req.headers.get('x-request-id') ?? null;
  if (!auth.user) {
    auth.payload.logger.warn(
      { requestId, path: req.nextUrl.pathname },
      '[gallery-delete] blocked unauthenticated request',
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
    const doc = resolvedImage.value as GalleryImage;

    const flightPlanId = normaliseId(doc.flightPlan);
    if (flightPlanId == null) {
      return corsJson(req, { error: 'Image not found.' }, { status: 404 }, METHODS);
    }

    let plan: FlightPlanAccessContext;
    try {
      plan = await auth.payload.findByID({
        collection: 'flight-plans',
        id: flightPlanId,
        depth: 0,
        overrideAccess: true,
      });
    } catch {
      return corsJson(req, { error: 'Image not found.' }, { status: 404 }, METHODS);
    }

    const ownerId = normaliseId(plan.owner);
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
        {
          requestId,
          path: req.nextUrl.pathname,
          userId: auth.user.id,
          flightPlanId,
        },
        '[gallery-delete] blocked by access control',
      );
      return corsJson(req, { error: 'You do not have permission to remove this image.' }, { status: 403 }, METHODS);
    }

    const activeReferenceCount = await countActiveMediaReferencesForAsset({
      payload: auth.payload as any,
      assetClass: 'gallery',
      assetId: imageId,
    });
    const referencedInOwnerDoc = collectSlideGalleryImageIds(plan.gallerySlides ?? []).includes(
      imageId,
    );
    if ((activeReferenceCount > 0 || referencedInOwnerDoc) && !forceDelete) {
      return corsJson(
        req,
        { error: 'Image is still referenced by the mission gallery. Remove the slide and save the mission before deleting the file, or retry with ?force=true.' },
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
      reasonPrefix: 'mission-gallery',
      requestedByUserId: normaliseId(auth.user.id),
    });
    if (queueResponse) {
      return queueResponse;
    }

    return corsEmpty(req, METHODS);
  } catch (error) {
    auth.payload.logger.error(
      { err: error, imageId, userId: auth.user.id },
      'Failed to queue mission gallery image delete',
    );
    return corsJson(req, { error: 'Unable to remove the image.' }, { status: 500 }, METHODS);
  }
}
