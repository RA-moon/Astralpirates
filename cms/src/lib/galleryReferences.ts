const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export const normaliseGalleryImageId = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const record = asRecord(value);
  if (!record || !('id' in record)) return null;
  return normaliseGalleryImageId(record.id);
};

const collectFromSlides = (slides: unknown, target: Set<number>) => {
  if (!Array.isArray(slides)) return;
  for (const entry of slides) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = normaliseGalleryImageId(record.galleryImage);
    if (id != null) {
      target.add(id);
    }
  }
};

export const collectGalleryImageIdsFromSlides = (slides: unknown): number[] => {
  const ids = new Set<number>();
  collectFromSlides(slides, ids);
  return Array.from(ids);
};

export const collectGalleryImageIdsFromPageLayout = (layout: unknown): number[] => {
  if (!Array.isArray(layout)) return [];
  const ids = new Set<number>();

  for (const block of layout) {
    const blockRecord = asRecord(block);
    if (!blockRecord || blockRecord.blockType !== 'imageCarousel') continue;
    collectFromSlides(blockRecord.slides, ids);
  }

  return Array.from(ids);
};

