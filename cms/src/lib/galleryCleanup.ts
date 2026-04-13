import type { Payload, PayloadRequest } from 'payload';

import { normaliseGalleryImageId } from './galleryReferences';
import { queueMediaDelete } from '../services/mediaLifecycle';

const PAGE_LIMIT = 100;
const MAX_SCAN_PAGES = 100;

type GalleryRelationField = 'flightPlan' | 'page';

type CleanupMode = 'warn' | 'throw';

const collectOrphanGalleryImageIds = async ({
  payload,
  req,
  relationField,
  relationId,
  keepImageIds,
}: {
  payload: Payload;
  req?: PayloadRequest;
  relationField: GalleryRelationField;
  relationId: number;
  keepImageIds: number[];
}): Promise<number[]> => {
  const keep = new Set(keepImageIds);
  const orphanIds: number[] = [];
  let page = 1;

  while (page <= MAX_SCAN_PAGES) {
    const result = await payload.find({
      collection: 'gallery-images',
      where: {
        [relationField]: {
          equals: relationId,
        },
      },
      limit: PAGE_LIMIT,
      page,
      depth: 0,
      overrideAccess: true,
      req,
    });

    const docs = Array.isArray(result?.docs) ? result.docs : [];
    if (!docs.length) break;

    for (const doc of docs) {
      const id = normaliseGalleryImageId(doc.id);
      if (id != null && !keep.has(id)) {
        orphanIds.push(id);
      }
    }

    const totalPages = Number.isFinite(result?.totalPages) ? result.totalPages : page;
    if (page >= totalPages) break;
    page += 1;
  }

  return orphanIds;
};

const cleanupUnusedGalleryImagesByRelation = async ({
  payload,
  req,
  context,
  relationField,
  relationId,
  keepImageIds,
  onError = 'warn',
}: {
  payload: Payload;
  req?: PayloadRequest;
  context?: Record<string, unknown>;
  relationField: GalleryRelationField;
  relationId: number;
  keepImageIds: number[];
  onError?: CleanupMode;
}): Promise<void> => {
  try {
    const orphanIds = await collectOrphanGalleryImageIds({
      payload,
      req,
      relationField,
      relationId,
      keepImageIds,
    });

    for (const id of orphanIds) {
      await queueMediaDelete({
        payload,
        assetClass: 'gallery',
        assetId: id,
        mode: 'safe',
        reason:
          relationField === 'flightPlan'
            ? 'flight-plan-gallery-owned-cleanup'
            : 'page-gallery-owned-cleanup',
        requestedByUserId: normaliseGalleryImageId(
          (req?.user as { id?: unknown } | null | undefined)?.id,
        ),
      });
    }
  } catch (error) {
    if (onError === 'throw') {
      throw error;
    }
    payload.logger.warn(
      { err: error, relationField, relationId, keepImageIds },
      '[gallery] failed to clean up orphaned uploads',
    );
  }
};

export const cleanupUnusedFlightPlanGalleryImages = async ({
  payload,
  req,
  context,
  flightPlanId,
  keepImageIds,
  strict = false,
}: {
  payload: Payload;
  req?: PayloadRequest;
  context?: Record<string, unknown>;
  flightPlanId: number;
  keepImageIds: number[];
  strict?: boolean;
}): Promise<void> =>
  cleanupUnusedGalleryImagesByRelation({
    payload,
    req,
    context,
    relationField: 'flightPlan',
    relationId: flightPlanId,
    keepImageIds,
    onError: strict ? 'throw' : 'warn',
  });

export const cleanupUnusedPageGalleryImages = async ({
  payload,
  req,
  context,
  pageId,
  keepImageIds,
  strict = false,
}: {
  payload: Payload;
  req?: PayloadRequest;
  context?: Record<string, unknown>;
  pageId: number;
  keepImageIds: number[];
  strict?: boolean;
}): Promise<void> =>
  cleanupUnusedGalleryImagesByRelation({
    payload,
    req,
    context,
    relationField: 'page',
    relationId: pageId,
    keepImageIds,
    onError: strict ? 'throw' : 'warn',
  });
