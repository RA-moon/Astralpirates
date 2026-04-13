import type { FlightPlanGalleryAsset } from '~/modules/api/schemas';

export type FlightPlanGallerySlideInput = {
  label: string;
  title: string;
  description: string;
  mediaType: 'image' | 'video' | 'audio' | 'model';
  imageType: 'upload' | 'url';
  imageUrl: string;
  imageAlt: string;
  creditLabel: string;
  creditUrl: string;
  galleryImage: number | null;
};

export type FlightPlanGallerySlideDraft = FlightPlanGallerySlideInput & {
  localId: string;
  asset: FlightPlanGalleryAsset | null;
  uploadState: 'idle' | 'uploading' | 'error';
  errorMessage: string;
};

const randomId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const cleanValue = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const cleanId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const cleanObjectId = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const direct = cleanId(record.id);
  if (direct != null) return direct;
  const nestedAsset =
    record.asset && typeof record.asset === 'object'
      ? (record.asset as Record<string, unknown>)
      : null;
  if (nestedAsset) {
    const nested = cleanId(nestedAsset.id);
    if (nested != null) return nested;
  }
  return null;
};

const cleanMediaType = (value: unknown): 'image' | 'video' | 'audio' | 'model' => {
  if (value === 'video') return 'video';
  if (value === 'audio') return 'audio';
  if (value === 'model') return 'model';
  return 'image';
};

type GallerySlideSourceLike = {
  imageType?: unknown;
  imageUrl?: unknown;
  galleryImage?: unknown;
  asset?: FlightPlanGalleryAsset | null;
};

const resolveUploadReferenceId = (slide: GallerySlideSourceLike): number | null => {
  const direct = cleanId(slide.galleryImage);
  if (direct != null) return direct;
  const relation = cleanObjectId(slide.galleryImage);
  if (relation != null) return relation;
  return cleanId(slide.asset?.id);
};

const resolveDraftImageType = (slide: GallerySlideSourceLike): 'upload' | 'url' => {
  if (slide.imageType === 'url') return 'url';
  if (slide.imageType === 'upload') return 'upload';
  if (resolveUploadReferenceId(slide) != null) return 'upload';
  const imageUrl = typeof slide.imageUrl === 'string' ? cleanValue(slide.imageUrl) : '';
  if (imageUrl.length) return 'url';
  return 'upload';
};

export const createGallerySlideDraft = (
  seed?: Partial<FlightPlanGallerySlideInput> & { localId?: string; asset?: FlightPlanGalleryAsset | null },
): FlightPlanGallerySlideDraft => {
  const imageType = resolveDraftImageType(seed ?? {});
  const imageUrl = cleanValue(seed?.imageUrl);
  const galleryImage = resolveUploadReferenceId(seed ?? {});

  return {
    localId: seed?.localId ?? randomId(),
    label: cleanValue(seed?.label),
    title: cleanValue(seed?.title),
    description: cleanValue(seed?.description),
    mediaType: cleanMediaType(seed?.mediaType),
    imageType,
    imageUrl,
    imageAlt: cleanValue(seed?.imageAlt),
    creditLabel: cleanValue(seed?.creditLabel),
    creditUrl: cleanValue(seed?.creditUrl),
    galleryImage: imageType === 'upload' ? galleryImage : null,
    asset: seed?.asset ?? null,
    uploadState: 'idle',
    errorMessage: '',
  };
};

export const stripDraftMetadata = (
  drafts: FlightPlanGallerySlideDraft[],
): FlightPlanGallerySlideInput[] =>
  drafts.map((draft) => {
    const imageType = resolveDraftImageType(draft);
    const imageUrl = cleanValue(draft.imageUrl);
    const galleryImage = resolveUploadReferenceId(draft);

    return {
      label: cleanValue(draft.label),
      title: cleanValue(draft.title),
      description: cleanValue(draft.description),
      mediaType: cleanMediaType(draft.mediaType),
      imageType,
      imageUrl,
      imageAlt: cleanValue(draft.imageAlt),
      creditLabel: cleanValue(draft.creditLabel),
      creditUrl: cleanValue(draft.creditUrl),
      galleryImage: imageType === 'upload' ? galleryImage : null,
    };
  });

export const deriveGalleryTitle = (filename: string): string => {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const words = withoutExt.replace(/[-_]+/g, ' ').trim();
  return words.length ? words : 'Mission media';
};

export type FlightPlanFormValues = {
  title: string;
  summary: string;
  body: string;
  category: 'test' | 'project' | 'event';
  location: string;
  eventDate: string;
  gallerySlides: FlightPlanGallerySlideInput[];
};
