export const SKIP_GALLERY_OWNED_CLEANUP = 'skipGalleryOwnedCleanup';
export const SKIP_GALLERY_REFERENCE_PRUNE = 'skipGalleryReferencePrune';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};

export const hasGalleryCleanupContextFlag = (
  context: unknown,
  flag: string,
): boolean => {
  if (!context || typeof context !== 'object') return false;
  return (context as Record<string, unknown>)[flag] === true;
};

export const withGalleryCleanupContextFlag = (
  context: unknown,
  flag: string,
): Record<string, unknown> => {
  const next = asRecord(context);
  next[flag] = true;
  return next;
};
