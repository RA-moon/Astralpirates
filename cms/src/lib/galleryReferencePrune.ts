import { normaliseGalleryImageId } from './galleryReferences';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const isGalleryImageMatch = (
  slide: Record<string, unknown>,
  galleryImageId: number,
): boolean => {
  const id = normaliseGalleryImageId(slide.galleryImage);
  return id != null && id === galleryImageId;
};

export const pruneGalleryImageFromSlides = ({
  slides,
  galleryImageId,
}: {
  slides: unknown;
  galleryImageId: number;
}): {
  changed: boolean;
  slides: unknown[];
} => {
  if (!Array.isArray(slides)) {
    return { changed: false, slides: [] };
  }

  const kept: unknown[] = [];
  let changed = false;

  for (const entry of slides) {
    const record = asRecord(entry);
    if (record && isGalleryImageMatch(record, galleryImageId)) {
      changed = true;
      continue;
    }
    kept.push(entry);
  }

  return { changed, slides: kept };
};

export const pruneGalleryImageFromPageLayout = ({
  layout,
  galleryImageId,
}: {
  layout: unknown;
  galleryImageId: number;
}): {
  changed: boolean;
  layout: unknown[];
} => {
  if (!Array.isArray(layout)) {
    return { changed: false, layout: [] };
  }

  const nextLayout: unknown[] = [];
  let changed = false;

  for (const block of layout) {
    const blockRecord = asRecord(block);
    if (!blockRecord || blockRecord.blockType !== 'imageCarousel') {
      nextLayout.push(block);
      continue;
    }

    const pruned = pruneGalleryImageFromSlides({
      slides: blockRecord.slides,
      galleryImageId,
    });
    if (pruned.changed) {
      changed = true;
      nextLayout.push({ ...blockRecord, slides: pruned.slides });
      continue;
    }

    nextLayout.push(block);
  }

  return {
    changed,
    layout: nextLayout,
  };
};
