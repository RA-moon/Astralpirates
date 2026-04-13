import type {
  PageBlock,
  PageDocument,
  Link,
  HeroBlock,
  CardGridBlock,
  CTAListBlock,
  TimelineBlock,
  ImageCarouselBlock,
  GalleryMediaType,
  StatGridBlock,
  CrewPreviewBlock,
  NavigationModuleBlock,
} from './api-contracts';
import { normalizeAccessPolicy } from './accessPolicy';

const trim = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const nullableString = (value: unknown) => {
  const next = trim(value);
  return next.length ? next : null;
};

const normalizeMediaUrl = (value: unknown): string | null => {
  const next = nullableString(value);
  if (!next) return null;
  if (next.startsWith('/')) return next;
  if (next.startsWith('//')) return `https:${next}`;
  try {
    const parsed = new URL(next);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const encodePathSegments = (value: string): string =>
  value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const buildGalleryProxyPath = (filename: string): string | null => {
  const trimmed = filename.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  const encoded = encodePathSegments(trimmed);
  return encoded.length > 0 ? `/api/gallery-images/file/${encoded}` : null;
};

const normalizeMimeType = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg';
  if (normalized === 'audio/x-m4a') return 'audio/mp4';
  if (normalized === 'audio/x-wav' || normalized === 'audio/wave') return 'audio/wav';
  if (normalized === 'video/x-m4v') return 'video/mp4';
  return normalized;
};

const ALLOWED_MEDIA_TYPES = new Set<GalleryMediaType>(['image', 'video', 'audio', 'model']);

const normalizeMediaType = (value: unknown): GalleryMediaType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!ALLOWED_MEDIA_TYPES.has(normalized as GalleryMediaType)) {
    return null;
  }
  return normalized as GalleryMediaType;
};

const resolveMediaTypeFromMime = (value: unknown): GalleryMediaType | null => {
  const mimeType = normalizeMimeType(value);
  if (!mimeType) return null;
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType.startsWith('model/') ||
    mimeType === 'application/vnd.autodesk.fbx' ||
    mimeType === 'application/x-fbx'
  ) {
    return 'model';
  }
  if (mimeType.startsWith('image/')) return 'image';
  return null;
};

const resolveMediaTypeFromUrl = (value: unknown): GalleryMediaType | null => {
  const url = normalizeMediaUrl(value);
  if (!url) return null;
  const pathname = url.startsWith('http://') || url.startsWith('https://')
    ? (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return url;
        }
      })()
    : url;
  const extensionMatch = pathname.match(/\.[a-z0-9]+$/i);
  const extension = extensionMatch?.[0]?.toLowerCase() ?? '';
  if (['.aac', '.m4a', '.mp3', '.oga', '.wav'].includes(extension)) {
    return 'audio';
  }
  if (['.mp4', '.m4v', '.mov', '.ogg', '.ogv', '.webm'].includes(extension)) {
    return 'video';
  }
  if (['.fbx', '.glb', '.gltf', '.obj', '.stl', '.usdz'].includes(extension)) {
    return 'model';
  }
  if (['.avif', '.gif', '.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
    return 'image';
  }
  return null;
};

const resolveCarouselUploadUrl = (slide: Record<string, unknown>): string | null => {
  const relation = slide.galleryImage;
  const relationRecord =
    relation && typeof relation === 'object'
      ? (relation as Record<string, unknown>)
      : null;
  const relationFilename =
    typeof relationRecord?.filename === 'string' ? relationRecord.filename.trim() : '';

  if (relationFilename.length > 0) {
    const proxyPath = buildGalleryProxyPath(relationFilename);
    if (proxyPath) {
      return proxyPath;
    }
  }

  const sizes = relationRecord?.sizes;
  const sizesRecord = sizes && typeof sizes === 'object'
    ? (sizes as Record<string, unknown>)
    : null;

  const preview = sizesRecord?.preview;
  const previewRecord =
    preview && typeof preview === 'object'
      ? (preview as Record<string, unknown>)
      : null;

  const thumbnail = sizesRecord?.thumbnail;
  const thumbnailRecord =
    thumbnail && typeof thumbnail === 'object'
      ? (thumbnail as Record<string, unknown>)
      : null;

  const candidates: unknown[] = [
    slide.imageUrl,
    relationRecord?.url,
    previewRecord?.url,
    thumbnailRecord?.url,
    relationRecord?.thumbnailURL,
  ];

  if (relationFilename.length > 0) {
    candidates.push(`/media/gallery/${relationFilename}`);
  }

  for (const candidate of candidates) {
    const normalized = normalizeMediaUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const hasGalleryImageReference = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if ('id' in record) {
    const id = record.id;
    if (typeof id === 'number') return Number.isFinite(id);
    if (typeof id === 'string') return id.trim().length > 0;
    return false;
  }
  return Object.keys(record).length > 0;
};

const resolveCarouselSlideType = (slide: Record<string, unknown>): 'upload' | 'url' => {
  if (slide.imageType === 'url') return 'url';
  if (slide.imageType === 'upload') return 'upload';
  if (normalizeMediaUrl(slide.imageUrl)) return 'url';
  if (hasGalleryImageReference(slide.galleryImage)) return 'upload';
  return 'upload';
};

const sanitizeLink = (value: unknown): Link | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<Link>;
  const label = nullableString(record.label);
  const href = nullableString(record.href);
  if (!label || !href) return null;
  const style =
    record.style === 'secondary' || record.style === 'link'
      ? record.style
      : 'primary';
  return {
    label,
    href,
    style,
  };
};

const sanitizeHeroBlock = (block: HeroBlock): HeroBlock => {
  const next = { ...block };
  next.eyebrow = nullableString(next.eyebrow) ?? undefined;
  next.title = nullableString(next.title) ?? 'Untitled hero';
  next.tagline = Array.isArray(next.tagline) ? next.tagline : [];
  next.body = Array.isArray(next.body) ? next.body : [];
  const ctas = Array.isArray(next.ctas)
    ? next.ctas
        .map((cta) => sanitizeLink(cta))
        .filter((cta): cta is Link => Boolean(cta))
    : [];
  if (ctas.length) {
    next.ctas = ctas;
  } else {
    delete (next as Partial<HeroBlock>).ctas;
  }
  return next;
};

const sanitizeCardGridBlock = (block: CardGridBlock): CardGridBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? '';
  next.intro = Array.isArray(next.intro) ? next.intro : [];
  next.columns = next.columns ?? 'three';
  next.cards = Array.isArray(next.cards) ? next.cards.map((card) => {
    const mapped = { ...card };
    mapped.badge = nullableString(mapped.badge) ?? undefined;
    mapped.title = nullableString(mapped.title) ?? 'Card';
    mapped.body = Array.isArray(mapped.body) ? mapped.body : [];
    const ctas = Array.isArray(mapped.ctas)
      ? mapped.ctas
          .map((cta) => sanitizeLink(cta))
          .filter((cta): cta is Link => Boolean(cta))
      : [];
    if (ctas.length) {
      mapped.ctas = ctas;
    } else {
      delete (mapped as Partial<CardGridBlock['cards'][number]>).ctas;
    }
    if (mapped.config && typeof mapped.config === 'object') {
      const limit = Number(mapped.config.limit);
      const minRole = nullableString(mapped.config.minRole) ?? undefined;
      const emptyLabel = nullableString(mapped.config.emptyLabel) ?? undefined;
      const cleanConfig: Record<string, unknown> = {};
      if (Number.isFinite(limit) && limit > 0) {
        cleanConfig.limit = Math.round(limit);
      }
      if (minRole) cleanConfig.minRole = minRole;
      if (emptyLabel) cleanConfig.emptyLabel = emptyLabel;
      mapped.config = Object.keys(cleanConfig).length ? cleanConfig : undefined;
    }
    return mapped;
  }) : [];
  return next;
};

const sanitizeCtaListBlock = (block: CTAListBlock): CTAListBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? '';
  next.intro = Array.isArray(next.intro) ? next.intro : [];
  next.items = Array.isArray(next.items)
    ? next.items.map((item) => {
        const mapped = { ...item };
        mapped.title = nullableString(mapped.title) ?? 'Item';
        mapped.description = Array.isArray(mapped.description)
          ? mapped.description
          : [];
        const cta = sanitizeLink(mapped.cta ?? null);
        if (cta) {
          mapped.cta = cta;
        } else {
          delete (mapped as Partial<typeof mapped>).cta;
        }
        return mapped;
      })
    : [];
  return next;
};

const sanitizeTimelineBlock = (block: TimelineBlock): TimelineBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? '';
  next.intro = Array.isArray(next.intro) ? next.intro : [];
  next.items = Array.isArray(next.items)
    ? next.items.map((item) => {
        const mapped = { ...item };
        mapped.heading = nullableString(mapped.heading) ?? 'Entry';
        mapped.timestamp = nullableString(mapped.timestamp) ?? undefined;
        mapped.body = Array.isArray(mapped.body) ? mapped.body : [];
        return mapped;
      })
    : [];
  return next;
};

const sanitizeImageCarouselBlock = (block: ImageCarouselBlock): ImageCarouselBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? '';
  next.intro = Array.isArray(next.intro) ? next.intro : [];
  next.slides = Array.isArray(next.slides)
    ? next.slides
        .map((slide) => {
          const mapped = { ...(slide as Record<string, unknown>) };
          const imageAlt = nullableString(mapped.imageAlt);
          if (!imageAlt) return null;

          const galleryImage = mapped.galleryImage;
          const hasGalleryImage = hasGalleryImageReference(galleryImage);
          const suppliedImageUrl = normalizeMediaUrl(mapped.imageUrl);
          const hydratedUploadUrl = resolveCarouselUploadUrl(mapped);

          let imageType = resolveCarouselSlideType(mapped);
          if (imageType === 'upload' && !hasGalleryImage && suppliedImageUrl) {
            imageType = 'url';
          }

          if (imageType === 'upload' && !hasGalleryImage) {
            return null;
          }

          const imageUrl =
            imageType === 'url'
              ? suppliedImageUrl
              : hydratedUploadUrl ?? suppliedImageUrl;

          if (imageType === 'url' && !imageUrl) {
            return null;
          }

          const relationRecord =
            galleryImage && typeof galleryImage === 'object'
              ? (galleryImage as Record<string, unknown>)
              : null;
          const mediaType =
            normalizeMediaType(mapped.mediaType) ??
            resolveMediaTypeFromMime(relationRecord?.mimeType) ??
            resolveMediaTypeFromUrl(imageUrl) ??
            'image';

          return {
            title: nullableString(mapped.title) ?? undefined,
            label: nullableString(mapped.label) ?? nullableString(mapped.title) ?? undefined,
            mediaType,
            imageType,
            galleryImage: imageType === 'upload' ? (galleryImage as ImageCarouselBlock['slides'][number]['galleryImage']) : undefined,
            imageUrl,
            imageAlt,
            caption: nullableString(mapped.caption) ?? nullableString(mapped.description) ?? undefined,
            creditLabel: nullableString(mapped.creditLabel) ?? undefined,
            creditUrl: normalizeMediaUrl(mapped.creditUrl) ?? undefined,
          } satisfies ImageCarouselBlock['slides'][number];
        })
        .filter(Boolean) as ImageCarouselBlock['slides']
    : [];
  return next;
};

const sanitizeStatGridBlock = (block: StatGridBlock): StatGridBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? '';
  next.intro = Array.isArray(next.intro) ? next.intro : [];
  next.stats = Array.isArray(next.stats)
    ? next.stats.map((stat) => ({
        ...stat,
        value: nullableString(stat.value) ?? '',
        label: nullableString(stat.label) ?? '',
      }))
    : [];
  const ctas = Array.isArray(next.ctas)
    ? next.ctas
        .map((cta) => sanitizeLink(cta))
        .filter((cta): cta is Link => Boolean(cta))
    : [];
  if (ctas.length) {
    next.ctas = ctas;
  } else {
    delete (next as Partial<StatGridBlock>).ctas;
  }
  return next;
};

const sanitizeCrewPreviewBlock = (block: CrewPreviewBlock): CrewPreviewBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? 'Crew preview';
  next.description = Array.isArray(next.description) ? next.description : [];
  const minRole = nullableString(next.minRole);
  next.minRole = minRole ?? undefined;
  const limit = Number(next.limit);
  if (Number.isFinite(limit) && limit > 0) {
    next.limit = Math.round(limit);
  } else {
    delete (next as Partial<CrewPreviewBlock>).limit;
  }
  const cta = sanitizeLink(next.cta ?? null);
  if (cta) {
    next.cta = cta;
  } else {
    delete (next as Partial<CrewPreviewBlock>).cta;
  }
  return next;
};

const sanitizeNavigationModuleBlock = (block: NavigationModuleBlock): NavigationModuleBlock => {
  const next = { ...block };
  next.title = nullableString(next.title) ?? undefined;
  next.description = Array.isArray(next.description) ? next.description : [];
  next.nodeId = nullableString(next.nodeId) ?? undefined;
  next.path = nullableString(next.path) ?? undefined;
  return next;
};

const applySanitizedAccessPolicy = (value: PageBlock): PageBlock => {
  const next = { ...(value as PageBlock & { accessPolicy?: unknown }) };
  const accessPolicy = normalizeAccessPolicy(next.accessPolicy);
  if (accessPolicy) {
    next.accessPolicy = accessPolicy;
  } else {
    delete next.accessPolicy;
  }
  return next as PageBlock;
};

const sanitizeBlock = (block: PageBlock): PageBlock => {
  const sanitized: PageBlock = (() => {
  switch (block.blockType) {
    case 'hero':
      return sanitizeHeroBlock(block as HeroBlock);
    case 'cardGrid':
      return sanitizeCardGridBlock(block as CardGridBlock);
    case 'ctaList':
      return sanitizeCtaListBlock(block as CTAListBlock);
    case 'timeline':
      return sanitizeTimelineBlock(block as TimelineBlock);
    case 'imageCarousel':
      return sanitizeImageCarouselBlock(block as ImageCarouselBlock);
    case 'statGrid':
      return sanitizeStatGridBlock(block as StatGridBlock);
    case 'crewRoster': {
      const next = { ...(block as PageBlock) };
      if (Array.isArray((next as any).ctas)) {
        const filtered = (next as any).ctas
          .map((cta: unknown) => sanitizeLink(cta))
          .filter((cta: Link | null): cta is Link => Boolean(cta));
        if (filtered.length) {
          (next as any).ctas = filtered;
        } else {
          delete (next as any).ctas;
        }
      }
      return next;
    }
    case 'crewPreview':
      return sanitizeCrewPreviewBlock(block as CrewPreviewBlock);
    case 'navigationModule':
      return sanitizeNavigationModuleBlock(block as NavigationModuleBlock);
    default:
      return { ...(block as PageBlock & Record<string, unknown>) };
  }
  })();

  return applySanitizedAccessPolicy(sanitized);
};

export const sanitizePageBlocks = (blocks?: PageBlock[] | null): PageBlock[] => {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block) =>
    block && typeof block === 'object' ? sanitizeBlock(block) : block,
  );
};

export const sanitizeNavigationOverrides = (
  navigation?: PageDocument['navigation'] | null,
) => {
  if (!navigation || typeof navigation !== 'object') return null;
  const nodeId = nullableString(navigation.nodeId ?? null);
  const label = nullableString(navigation.label ?? null);
  const description = nullableString(navigation.description ?? null);
  if (!nodeId && !label && !description) {
    return null;
  }
  const result: PageDocument['navigation'] = {};
  if (nodeId) result.nodeId = nodeId;
  if (label) result.label = label;
  if (description) result.description = description;
  return result;
};
