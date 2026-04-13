process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import payload, { type Payload } from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  collectGalleryImageIdsFromPageLayout,
  collectGalleryImageIdsFromSlides,
  normaliseGalleryImageId,
} from '@/src/lib/galleryReferences';
import {
  pruneGalleryImageFromPageLayout,
  pruneGalleryImageFromSlides,
} from '@/src/lib/galleryReferencePrune';
import {
  SKIP_GALLERY_OWNED_CLEANUP,
  SKIP_GALLERY_REFERENCE_PRUNE,
  withGalleryCleanupContextFlag,
} from '@/src/lib/galleryCleanupContext';
import { queueMediaDelete } from '@/src/services/mediaLifecycle';

const PAGE_SIZE = 50;

type RepairOptions = {
  apply: boolean;
  deleteOwnedUnreferenced: boolean;
};

type OwnedGalleryImage = {
  id: number;
  flightPlanId: number | null;
  pageId: number | null;
};

type ReconcileSummary = {
  docsScanned: number;
  docsUpdated: number;
  missingRefsRemoved: number;
};

const parseArgs = (): RepairOptions => {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
    deleteOwnedUnreferenced: !args.has('--keep-unreferenced-owned'),
  };
};

const buildSkipContext = (): Record<string, unknown> => {
  const withOwnedSkip = withGalleryCleanupContextFlag({}, SKIP_GALLERY_OWNED_CLEANUP);
  return withGalleryCleanupContextFlag(withOwnedSkip, SKIP_GALLERY_REFERENCE_PRUNE);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const pruneMissingGalleryRefsFromSlides = ({
  slides,
  existingIds,
}: {
  slides: unknown;
  existingIds: Set<number>;
}): {
  changed: boolean;
  slides: unknown[];
  removed: number;
} => {
  if (!Array.isArray(slides)) {
    return { changed: false, slides: [], removed: 0 };
  }

  let current = slides as unknown[];
  let changed = false;
  let removed = 0;

  for (const imageId of collectGalleryImageIdsFromSlides(slides)) {
    if (existingIds.has(imageId)) continue;
    const next = pruneGalleryImageFromSlides({
      slides: current,
      galleryImageId: imageId,
    });
    if (next.changed) {
      const beforeLength = current.length;
      const afterLength = next.slides.length;
      removed += Math.max(0, beforeLength - afterLength);
      current = next.slides;
      changed = true;
    }
  }

  return {
    changed,
    slides: current,
    removed,
  };
};

const pruneMissingGalleryRefsFromPageLayout = ({
  layout,
  existingIds,
}: {
  layout: unknown;
  existingIds: Set<number>;
}): {
  changed: boolean;
  layout: unknown[];
  removed: number;
} => {
  if (!Array.isArray(layout)) {
    return { changed: false, layout: [], removed: 0 };
  }

  let current = layout as unknown[];
  let changed = false;
  let removed = 0;

  for (const imageId of collectGalleryImageIdsFromPageLayout(layout)) {
    if (existingIds.has(imageId)) continue;
    const next = pruneGalleryImageFromPageLayout({
      layout: current,
      galleryImageId: imageId,
    });
    if (next.changed) {
      const beforeSlides = collectGalleryImageIdsFromPageLayout(current).length;
      const afterSlides = collectGalleryImageIdsFromPageLayout(next.layout).length;
      removed += Math.max(0, beforeSlides - afterSlides);
      current = next.layout;
      changed = true;
    }
  }

  return {
    changed,
    layout: current,
    removed,
  };
};

const loadOwnedGalleryImages = async (instance: Payload): Promise<OwnedGalleryImage[]> => {
  const images: OwnedGalleryImage[] = [];
  let page = 1;

  while (true) {
    const result = await instance.find({
      collection: 'gallery-images',
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });

    if (!result.docs.length) break;

    for (const doc of result.docs) {
      const id = normaliseGalleryImageId((doc as { id?: unknown }).id);
      if (id == null) continue;

      const record = doc as { flightPlan?: unknown; page?: unknown };
      images.push({
        id,
        flightPlanId: normaliseGalleryImageId(record.flightPlan),
        pageId: normaliseGalleryImageId(record.page),
      });
    }

    if (page >= result.totalPages) break;
    page += 1;
  }

  return images;
};

const reconcileFlightPlans = async ({
  instance,
  existingIds,
  options,
  referencedIds,
}: {
  instance: Payload;
  existingIds: Set<number>;
  options: RepairOptions;
  referencedIds: Set<number>;
}): Promise<ReconcileSummary> => {
  const context = buildSkipContext();
  let docsScanned = 0;
  let docsUpdated = 0;
  let missingRefsRemoved = 0;
  let page = 1;

  while (true) {
    const result = await instance.find({
      collection: 'flight-plans',
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });

    if (!result.docs.length) break;

    for (const doc of result.docs) {
      docsScanned += 1;
      const id = normaliseGalleryImageId((doc as { id?: unknown }).id);
      if (id == null) continue;

      const rawSlides = (doc as { gallerySlides?: unknown }).gallerySlides;
      const pruned = pruneMissingGalleryRefsFromSlides({
        slides: rawSlides,
        existingIds,
      });
      missingRefsRemoved += pruned.removed;

      if (options.apply && pruned.changed) {
        await instance.update({
          collection: 'flight-plans',
          id,
          data: {
            gallerySlides: pruned.slides,
          } as any,
          overrideAccess: true,
          context,
        });
        docsUpdated += 1;
      }

      for (const imageId of collectGalleryImageIdsFromSlides(pruned.changed ? pruned.slides : rawSlides)) {
        referencedIds.add(imageId);
      }
    }

    if (page >= result.totalPages) break;
    page += 1;
  }

  return {
    docsScanned,
    docsUpdated,
    missingRefsRemoved,
  };
};

const reconcilePages = async ({
  instance,
  existingIds,
  options,
  referencedIds,
}: {
  instance: Payload;
  existingIds: Set<number>;
  options: RepairOptions;
  referencedIds: Set<number>;
}): Promise<ReconcileSummary> => {
  const context = buildSkipContext();
  let docsScanned = 0;
  let docsUpdated = 0;
  let missingRefsRemoved = 0;
  let page = 1;

  while (true) {
    const result = await instance.find({
      collection: 'pages',
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });

    if (!result.docs.length) break;

    for (const doc of result.docs) {
      docsScanned += 1;
      const id = normaliseGalleryImageId((doc as { id?: unknown }).id);
      if (id == null) continue;

      const rawLayout = (doc as { layout?: unknown }).layout;
      const pruned = pruneMissingGalleryRefsFromPageLayout({
        layout: rawLayout,
        existingIds,
      });
      missingRefsRemoved += pruned.removed;

      if (options.apply && pruned.changed) {
        await instance.update({
          collection: 'pages',
          id,
          data: {
            layout: pruned.layout,
          } as any,
          overrideAccess: true,
          context,
        });
        docsUpdated += 1;
      }

      for (const imageId of collectGalleryImageIdsFromPageLayout(pruned.changed ? pruned.layout : rawLayout)) {
        referencedIds.add(imageId);
      }
    }

    if (page >= result.totalPages) break;
    page += 1;
  }

  return {
    docsScanned,
    docsUpdated,
    missingRefsRemoved,
  };
};

const deleteOwnedUnreferencedImages = async ({
  instance,
  ownedImages,
  referencedIds,
  options,
}: {
  instance: Payload;
  ownedImages: OwnedGalleryImage[];
  referencedIds: Set<number>;
  options: RepairOptions;
}): Promise<{ candidates: number; deleted: number }> => {
  let candidates = 0;
  let deleted = 0;

  for (const image of ownedImages) {
    const isOwned = image.flightPlanId != null || image.pageId != null;
    if (!isOwned) continue;
    if (referencedIds.has(image.id)) continue;

    candidates += 1;
    if (!options.apply || !options.deleteOwnedUnreferenced) continue;

    try {
      await queueMediaDelete({
        payload: instance,
        assetClass: 'gallery',
        assetId: image.id,
        mode: 'force',
        reason: 'repair-gallery-unreferenced-owned',
      });
      deleted += 1;
    } catch (error) {
      const errRecord = asRecord(error);
      const message =
        (typeof errRecord?.message === 'string' && errRecord.message) ||
        (error instanceof Error ? error.message : String(error));
      instance.logger.warn(
        { imageId: image.id, err: message },
        '[repair-gallery] failed to delete unreferenced owned upload',
      );
    }
  }

  return { candidates, deleted };
};

const shutdownPayloadInstance = async (instance: Payload): Promise<void> => {
  await instance.shutdown?.().catch(() => null);
  await instance.db?.destroy?.().catch(() => null);
};

const main = async (): Promise<void> => {
  const options = parseArgs();
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ script: 'repair-gallery' }) ?? instance.logger ?? console;

  try {
    logger.info?.(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        deleteOwnedUnreferenced: options.deleteOwnedUnreferenced,
      },
      '[repair-gallery] starting gallery reference reconciliation',
    );

    const ownedImages = await loadOwnedGalleryImages(instance);
    const existingIds = new Set<number>(ownedImages.map((image) => image.id));
    const referencedIds = new Set<number>();

    const flightPlanSummary = await reconcileFlightPlans({
      instance,
      existingIds,
      options,
      referencedIds,
    });

    const pageSummary = await reconcilePages({
      instance,
      existingIds,
      options,
      referencedIds,
    });

    const orphanSummary = await deleteOwnedUnreferencedImages({
      instance,
      ownedImages,
      referencedIds,
      options,
    });

    logger.info?.(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        flightPlans: flightPlanSummary,
        pages: pageSummary,
        ownedUploads: {
          total: ownedImages.length,
          referenced: referencedIds.size,
          unreferencedOwnedCandidates: orphanSummary.candidates,
          deleted: orphanSummary.deleted,
        },
      },
      '[repair-gallery] reconciliation finished',
    );
  } finally {
    await shutdownPayloadInstance(instance);
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[repair-gallery] failed', error);
    process.exit(1);
  });
