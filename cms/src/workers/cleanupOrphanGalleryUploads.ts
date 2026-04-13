process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Cron } from 'croner';
import payload, { type Payload } from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  collectGalleryImageIdsFromPageLayout,
  collectGalleryImageIdsFromSlides,
  normaliseGalleryImageId,
} from '@/src/lib/galleryReferences';
import { queueMediaDelete } from '@/src/services/mediaLifecycle';

const CRON_SCHEDULE = '15 3 * * *';
const CRON_TIMEZONE = 'UTC';
const PAGE_SIZE = 50;
const RUN_CLEANUP_ON_START = process.env.GALLERY_CLEANUP_RUN_ON_START !== 'false';

const shouldRunOnce =
  process.argv.includes('--run-once') ||
  process.argv.includes('--once') ||
  process.env.GALLERY_CLEANUP_RUN_ONCE === 'true';

const collectReferencedGalleryImageIds = async (instance: Payload): Promise<Set<number>> => {
  const referenced = new Set<number>();

  let flightPlanPage = 1;
  while (true) {
    const flightPlans = await instance.find({
      collection: 'flight-plans',
      page: flightPlanPage,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });
    if (!flightPlans.docs.length) break;

    for (const doc of flightPlans.docs) {
      for (const id of collectGalleryImageIdsFromSlides((doc as { gallerySlides?: unknown }).gallerySlides)) {
        referenced.add(id);
      }
    }

    if (flightPlanPage >= flightPlans.totalPages) break;
    flightPlanPage += 1;
  }

  let pagesPage = 1;
  while (true) {
    const pages = await instance.find({
      collection: 'pages',
      page: pagesPage,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });
    if (!pages.docs.length) break;

    for (const doc of pages.docs) {
      for (const id of collectGalleryImageIdsFromPageLayout((doc as { layout?: unknown }).layout)) {
        referenced.add(id);
      }
    }

    if (pagesPage >= pages.totalPages) break;
    pagesPage += 1;
  }

  return referenced;
};

const findOrphanGalleryImages = async (instance: Payload): Promise<number[]> => {
  const orphanIds: number[] = [];
  const referencedIds = await collectReferencedGalleryImageIds(instance);
  let page = 1;

  while (true) {
    const images = await instance.find({
      collection: 'gallery-images',
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });

    if (!images.docs.length) {
      break;
    }

    for (const doc of images.docs) {
      const id = normaliseGalleryImageId(doc?.id);
      if (id == null) continue;
      if (!referencedIds.has(id)) {
        orphanIds.push(id);
      }
    }

    if (page >= images.totalPages) {
      break;
    }
    page += 1;
  }

  return orphanIds;
};

const cleanupOrphanGalleryUploads = async (instance: Payload) => {
  const logger =
    instance.logger?.child?.({ worker: 'gallery-upload-cleanup' }) ??
    instance.logger ??
    console;

  logger.info?.('[gallery-upload-cleanup] scanning for orphaned uploads');
  const orphanIds = await findOrphanGalleryImages(instance);
  if (!orphanIds.length) {
    logger.info?.('[gallery-upload-cleanup] no orphaned uploads found');
    return;
  }

  logger.info?.({ count: orphanIds.length }, '[gallery-upload-cleanup] removing orphaned uploads');
  for (const id of orphanIds) {
    try {
      await queueMediaDelete({
        payload: instance,
        assetClass: 'gallery',
        assetId: id,
        mode: 'safe',
        reason: 'gallery-orphan-cleanup-worker',
      });
    } catch (error) {
      logger.error?.({ err: error, uploadId: id }, '[gallery-upload-cleanup] failed to delete upload');
    }
  }
};

const startWorker = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ worker: 'gallery-upload-cleanup' }) ?? instance.logger ?? console;

  const runCleanup = async () => {
    try {
      await cleanupOrphanGalleryUploads(instance);
    } catch (error) {
      logger.error?.({ err: error }, '[gallery-upload-cleanup] cleanup failed');
    }
  };

  if (shouldRunOnce) {
    await runCleanup();
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  }

  if (RUN_CLEANUP_ON_START) {
    logger.info?.('[gallery-upload-cleanup] running startup cleanup sweep');
    await runCleanup();
  }

  logger.info?.(
    { schedule: CRON_SCHEDULE, timezone: CRON_TIMEZONE },
    '[gallery-upload-cleanup] scheduling daily cleanup',
  );

  const job = new Cron(
    CRON_SCHEDULE,
    { timezone: CRON_TIMEZONE },
    async () => {
      await runCleanup();
    },
  );

  const nextRun = job.nextRun();
  if (nextRun) {
    logger.info?.(
      { nextRun: typeof nextRun.toISOString === 'function' ? nextRun.toISOString() : String(nextRun) },
      '[gallery-upload-cleanup] next run scheduled',
    );
  }

  const shutdown = async () => {
    logger.info?.('[gallery-upload-cleanup] Shutting down worker');
    job.stop();
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startWorker().catch((error) => {
  console.error('[gallery-upload-cleanup] Worker crashed', error);
  process.exit(1);
});
