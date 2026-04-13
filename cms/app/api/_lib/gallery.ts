import type { Payload } from 'payload';

import { cleanupUnusedFlightPlanGalleryImages } from '@/src/lib/galleryCleanup';
import { collectGalleryImageIdsFromSlides } from '@/src/lib/galleryReferences';

export const collectSlideGalleryImageIds = collectGalleryImageIdsFromSlides;

export const cleanupUnusedGalleryImages = async ({
  payload,
  flightPlanId,
  keepImageIds,
}: {
  payload: Payload;
  flightPlanId: number;
  keepImageIds: number[];
}): Promise<void> => {
  await cleanupUnusedFlightPlanGalleryImages({
    payload,
    flightPlanId,
    keepImageIds,
  });
};
