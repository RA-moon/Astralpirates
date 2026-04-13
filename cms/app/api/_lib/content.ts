import type { Payload } from 'payload';
import sanitizeHtml from 'sanitize-html';

import type { FlightPlan, Log, User } from '@/payload-types';

import { toCrewSummary, type CrewSummary } from './crew';
import { parseLogTitle } from '@/src/utils/logTitles';
import { buildMediaFileUrl } from '@/src/storage/mediaConfig';
import {
  deduceGalleryMediaType,
  type GalleryMediaType,
} from '@/src/storage/galleryMedia';
import {
  deriveFlightPlanVisibility,
  resolveFlightPlanPolicy,
  type AccessPolicy,
  type FlightPlanVisibilityLevel,
} from '@astralpirates/shared/accessPolicy';
import {
  deriveFlightPlanLifecycleBucket,
  normaliseFlightPlanLifecycleStatus,
} from '@astralpirates/shared/flightPlanLifecycle';
import {
  GALLERY_MEDIA_PROXY_PATH,
  shouldTreatHostnameAsInternalMedia,
} from '@astralpirates/shared/mediaUrls';
import { resolveFlightPlanMediaVisibility } from './mediaGovernance';

type DocWithOwner = {
  owner?: User | number | null;
  statusChangedBy?: User | number | null;
};

const normalizeId = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const nested = (value as { id?: unknown }).id;
    if (typeof nested === 'number') return nested;
    if (typeof nested === 'string') {
      const parsed = Number.parseInt(nested, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }
  return null;
};

const getLogField = (log: Log, key: 'tagline' | 'summary'): string | null => {
  const record = log as unknown as Record<string, unknown>;
  const value = record[key];
  return typeof value === 'string' ? value : null;
};

export type RichTextTextNode = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
};

export type RichTextNode = {
  type?: string;
  url?: string;
  newTab?: boolean;
  children: Array<RichTextTextNode | RichTextNode>;
};

export type RichTextContent = RichTextNode[];

type LexicalNode = {
  type?: string;
  text?: string;
  format?: number | string;
  style?: string;
  children?: LexicalNode[];
  url?: string;
  target?: string | null;
  rel?: string | null;
  newTab?: boolean;
};

type LexicalDocument = {
  root?: {
    type?: string;
    children?: LexicalNode[];
  } | null;
};

const extractFormatting = (format: number | string | undefined, style: string | undefined) => {
  if (typeof format === 'number') {
    return {
      bold: Boolean(format & 1),
      italic: Boolean(format & 2),
      underline: Boolean(format & 4),
      strikethrough: Boolean(format & 8),
    };
  }

  if (typeof format === 'string') {
    const flags = format.split(' ');
    return {
      bold: flags.includes('bold'),
      italic: flags.includes('italic'),
      underline: flags.includes('underline'),
      strikethrough: flags.includes('strikethrough'),
    };
  }

  if (typeof style === 'string' && style.includes('font-weight: bold')) {
    return { bold: true };
  }

  return {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  };
};

const sanitizeTextNode = (node: any): RichTextTextNode | null => {
  if (!node || typeof node !== 'object') return null;
  const text = typeof node.text === 'string' ? node.text : '';
  if (!text.trim()) return null;
  const entry: RichTextTextNode = { text };
  if (node.bold === true) entry.bold = true;
  if (node.italic === true) entry.italic = true;
  if (node.underline === true) entry.underline = true;
  if (node.strikethrough === true) entry.strikethrough = true;
  return entry;
};

const sanitizeRichTextNode = (node: any): RichTextNode | null => {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node.children)) {
    const children = (node.children as unknown[])
      .map((child: unknown) => {
        if (child && typeof child === 'object' && 'text' in child) {
          return sanitizeTextNode(child);
        }
        return sanitizeRichTextNode(child);
      })
      .filter((child): child is RichTextTextNode | RichTextNode => Boolean(child));

    if (!children.length) return null;

    const result: RichTextNode = { children };
    if (typeof node.type === 'string') result.type = node.type;
    if (typeof node.url === 'string') result.url = node.url;
    if (node.newTab === true) result.newTab = true;
    return result;
  }

  return null;
};

const convertLexicalChildren = (nodes: LexicalNode[] | undefined): Array<RichTextNode | RichTextTextNode> => {
  if (!Array.isArray(nodes)) return [];
  const result: Array<RichTextNode | RichTextTextNode> = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;

    switch (node.type) {
      case 'linebreak':
        result.push({ text: '\n' });
        break;
      case 'text': {
        const text = typeof node.text === 'string' ? node.text : '';
        if (!text) break;
        const formatting = extractFormatting(node.format, node.style);
        const entry: RichTextTextNode = { text };
        if (formatting.bold) entry.bold = true;
        if (formatting.italic) entry.italic = true;
        if (formatting.underline) entry.underline = true;
        if (formatting.strikethrough) entry.strikethrough = true;
        result.push(entry);
        break;
      }
      case 'link': {
        const children = convertLexicalChildren(node.children);
        if (!children.length) break;
        const entry: RichTextNode = {
          type: 'link',
          url: typeof node.url === 'string' ? node.url : undefined,
          newTab: node.target === '_blank' ? true : undefined,
          children,
        };
        result.push(entry);
        break;
      }
      default: {
        const children = convertLexicalChildren(node.children);
        if (!children.length) break;
        const entry: RichTextNode = {
          type: typeof node.type === 'string' ? node.type : undefined,
          children,
        };
        result.push(entry);
        break;
      }
    }
  }
  return result;
};

const convertLexicalDocument = (value: LexicalDocument): RichTextContent => {
  const rootChildren = value?.root?.children;
  if (!Array.isArray(rootChildren)) return [];
  const nodes = convertLexicalChildren(rootChildren).map((entry) => {
    if ('text' in entry) {
      return {
        type: 'paragraph',
        children: [entry],
      } satisfies RichTextNode;
    }
    if (entry.type === 'paragraph' || entry.type === undefined) {
      return {
        type: 'paragraph',
        children: entry.children,
      } satisfies RichTextNode;
    }
    return entry;
  });
  return nodes.filter((node): node is RichTextNode => Array.isArray(node.children) && node.children.length > 0);
};

const toRichTextParagraphs = (value: string): RichTextContent => {
  return value
    .split(/\r?\n{2,}/)
    .map((part) => part.replace(/\r?\n/g, ' ').trim())
    .filter((part) => part.length > 0)
    .map(
      (part) =>
        ({
          type: 'paragraph',
          children: [{ text: part }],
        }) satisfies RichTextNode,
    );
};

export const normalizeRichTextContent = (value: unknown): RichTextContent => {
  if (value == null) return [];
  if (typeof value === 'string') {
    return toRichTextParagraphs(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((node) => sanitizeRichTextNode(node))
      .filter((node): node is RichTextNode => Boolean(node && Array.isArray(node.children) && node.children.length));
  }
  const maybeDocument = value as LexicalDocument;
  if (maybeDocument && typeof maybeDocument === 'object' && maybeDocument.root) {
    return convertLexicalDocument(maybeDocument);
  }
  return [];
};

const isLexicalNodeWithChildren = (value: unknown): value is { children: unknown[] } =>
  Boolean(value && typeof value === 'object' && Array.isArray((value as { children?: unknown }).children));

export const isLexicalDocument = (value: unknown): value is LexicalDocument => {
  if (!value || typeof value !== 'object') return false;
  const root = (value as { root?: unknown }).root;
  return isLexicalNodeWithChildren(root);
};

const collectRichTextTextNodes = (node: RichTextNode, acc: RichTextTextNode[]): void => {
  node.children.forEach((child) => {
    if ('text' in child) {
      if (child.text.trim().length) acc.push(child);
    } else {
      collectRichTextTextNodes(child, acc);
    }
  });
};

const TEXT_FORMAT_FLAGS = {
  bold: 1,
  italic: 2,
  underline: 4,
  strikethrough: 8,
} as const;

const richTextTextNodeToLexical = (node: RichTextTextNode): LexicalNode => {
  let format = 0;
  if (node.bold) format |= TEXT_FORMAT_FLAGS.bold;
  if (node.italic) format |= TEXT_FORMAT_FLAGS.italic;
  if (node.underline) format |= TEXT_FORMAT_FLAGS.underline;
  if (node.strikethrough) format |= TEXT_FORMAT_FLAGS.strikethrough;

  // Cast to LexicalNode because the upstream type omits text-specific fields like detail/mode/style.
  return {
    type: 'text',
    text: node.text,
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    version: 1,
  } as unknown as LexicalNode;
};

const richTextNodeToLexicalParagraph = (node: RichTextNode): LexicalNode | null => {
  const textChildren: RichTextTextNode[] = [];
  collectRichTextTextNodes(node, textChildren);
  if (!textChildren.length) return null;
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    direction: 'ltr',
    version: 1,
    children: textChildren.map(richTextTextNodeToLexical),
  } as unknown as LexicalNode;
};

const emptyLexicalParagraph = (): LexicalNode =>
  ({
    type: 'paragraph',
    format: '',
    indent: 0,
    direction: 'ltr',
    version: 1,
    children: [
      {
        type: 'text',
        text: '',
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        version: 1,
      } as unknown as LexicalNode,
    ],
  } as unknown as LexicalNode);

export const richTextContentToLexicalDocument = (content: RichTextContent): LexicalDocument => {
  const children = content
    .map((node) => richTextNodeToLexicalParagraph(node))
    .filter((node): node is LexicalNode => Boolean(node));

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: children.length ? children : [emptyLexicalParagraph()],
    } as unknown as LexicalNode,
  };
};

const collectText = (nodes: RichTextContent, acc: string[]): void => {
  for (const node of nodes) {
    for (const child of node.children) {
      if ('text' in child) {
        acc.push(child.text);
      } else if (Array.isArray(child.children)) {
        collectText([child], acc);
      }
    }
  }
};

const richTextToPlainText = (content: RichTextContent): string => {
  const parts: string[] = [];
  collectText(content, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const normalizeSlideString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeSlideUrl = (value: unknown): string | null => {
  const parsedInput = normalizeSlideString(value);
  if (!parsedInput) return null;
  if (parsedInput.startsWith('/')) {
    return parsedInput;
  }
  if (parsedInput.startsWith('//')) {
    return `https:${parsedInput}`;
  }
  try {
    const parsed = new URL(parsedInput);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch (error) {
    return null;
  }
};

export type FlightPlanGalleryAsset = {
  id: number;
  url: string;
  filename?: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  filesize: number | null;
};

export type FlightPlanGallerySlide = {
  label: string | null;
  title: string | null;
  description: string | null;
  mediaType: GalleryMediaType;
  imageType: 'upload' | 'url';
  imageUrl: string;
  imageAlt: string;
  creditLabel: string | null;
  creditUrl: string | null;
  asset: FlightPlanGalleryAsset | null;
};

const MAX_FLIGHT_PLAN_SLIDES = 8;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveGalleryAssetUrlFromRecord = (record: Record<string, unknown>): string | null => {
  const proxyUrlFromFilename = (() => {
    const filename = typeof record.filename === 'string' ? record.filename.trim() : '';
    if (!filename) return null;
    const encoded = filename
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${GALLERY_MEDIA_PROXY_PATH}${encoded}`;
  })();

  // Upload-backed gallery assets should resolve to one canonical, same-origin proxy URL.
  // This avoids client dependence on direct media hostnames returned by storage adapters.
  if (proxyUrlFromFilename) {
    return proxyUrlFromFilename;
  }

  const internalMediaHosts = (() => {
    const hosts = new Set<string>();
    const payloadServerUrl =
      typeof process.env.PAYLOAD_PUBLIC_SERVER_URL === 'string'
        ? process.env.PAYLOAD_PUBLIC_SERVER_URL.trim()
        : '';
    if (!payloadServerUrl) return hosts;
    try {
      hosts.add(new URL(payloadServerUrl).hostname.toLowerCase());
    } catch {
      // Ignore malformed PAYLOAD_PUBLIC_SERVER_URL and fall back to static internal host list.
    }
    return hosts;
  })();

  const isInternalMediaHost = (value: string): boolean => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return internalMediaHosts.has(hostname) || shouldTreatHostnameAsInternalMedia(hostname);
    } catch {
      return false;
    }
  };

  const directCandidates: unknown[] = [
    record.url,
    record.imageUrl,
    (record as { thumbnailURL?: unknown }).thumbnailURL,
    (record as { thumbnailUrl?: unknown }).thumbnailUrl,
    (record as { previewURL?: unknown }).previewURL,
    (record as { previewUrl?: unknown }).previewUrl,
  ];

  const sizes = record.sizes;
  if (sizes && typeof sizes === 'object') {
    const sizesRecord = sizes as Record<string, unknown>;
    const preview = sizesRecord.preview;
    const thumbnail = sizesRecord.thumbnail;

    if (preview && typeof preview === 'object') {
      directCandidates.push((preview as { url?: unknown }).url);
    }
    if (thumbnail && typeof thumbnail === 'object') {
      directCandidates.push((thumbnail as { url?: unknown }).url);
    }
  }

  if (!proxyUrlFromFilename && typeof record.filename === 'string' && record.filename.trim().length > 0) {
    const fallbackUrl = buildMediaFileUrl('gallery', record.filename);
    if (fallbackUrl) {
      directCandidates.push(fallbackUrl);
    }
  }

  let firstInternalHostCandidate: string | null = null;
  for (const candidate of directCandidates) {
    const normalized = normalizeSlideUrl(candidate);
    if (normalized) {
      if (!isInternalMediaHost(normalized)) {
        return normalized;
      }
      if (!firstInternalHostCandidate) {
        firstInternalHostCandidate = normalized;
      }
    }
  }

  if (proxyUrlFromFilename) {
    return proxyUrlFromFilename;
  }

  if (firstInternalHostCandidate) {
    return firstInternalHostCandidate;
  }

  return null;
};

export const resolveGalleryAssetUrl = (value: unknown): string | null => {
  if (value && typeof value === 'object') {
    return resolveGalleryAssetUrlFromRecord(value as Record<string, unknown>);
  }
  return normalizeSlideUrl(value);
};

const toGalleryAsset = (value: unknown): FlightPlanGalleryAsset | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = toNumber(record.id);
  const url = resolveGalleryAssetUrlFromRecord(record);
  if (id == null || !url) return null;
  const width = toNumber(record.width);
  const height = toNumber(record.height);
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null;
  const filesize = toNumber(record.filesize);
  const filename = typeof record.filename === 'string' ? record.filename : null;
  return {
    id,
    url,
    filename,
    width,
    height,
    mimeType,
    filesize,
  };
};

const deduceImageType = (value: unknown, hasAsset: boolean): 'upload' | 'url' => {
  if (value === 'url') return 'url';
  if (value === 'upload') return 'upload';
  return hasAsset ? 'upload' : 'url';
};

export const normalizeFlightPlanSlides = (value: unknown): FlightPlanGallerySlide[] => {
  if (!Array.isArray(value)) return [];
  const slides: FlightPlanGallerySlide[] = [];
  const seenLabels = new Set<string>();

  for (const entry of value) {
    if (slides.length >= MAX_FLIGHT_PLAN_SLIDES) break;
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const asset = toGalleryAsset(record.galleryImage ?? record.asset);
    const imageType = deduceImageType(record.imageType, Boolean(asset));
    const imageUrl = asset?.url ?? resolveGalleryAssetUrl(record.imageUrl ?? record.image ?? record.galleryImage);
    const imageAlt = normalizeSlideString(record.imageAlt);
    if (!imageUrl || !imageAlt) continue;
    const mediaType = deduceGalleryMediaType({
      mediaType: record.mediaType,
      mimeType: asset?.mimeType,
      filename: asset?.filename,
      url: imageUrl,
    });
    const rawLabel = normalizeSlideString(record.label);
    let label = rawLabel ?? null;
    if (label) {
      const key = label.toLowerCase();
      if (seenLabels.has(key)) {
        label = null;
      } else {
        seenLabels.add(key);
      }
    }
    const title = normalizeSlideString(record.title);
    const description = normalizeSlideString(record.description) ?? normalizeSlideString(record.caption);
    const creditLabel = normalizeSlideString(record.creditLabel);
    const creditUrl = normalizeSlideUrl(record.creditUrl);
    slides.push({
      label,
      title,
      description,
      mediaType,
      imageType,
      imageUrl,
      imageAlt,
      creditLabel,
      creditUrl,
      asset,
    });
  }

  return slides;
};

type FlightPlanGallerySlideWrite = {
  label: string | null;
  title: string | null;
  caption: string | null;
  creditLabel: string | null;
  creditUrl: string | null;
  mediaType: GalleryMediaType;
  imageAlt: string;
  imageUrl: string;
  imageType: 'upload' | 'url';
  galleryImage: number | null;
};

const normalizeGalleryImageId = (value: unknown): number | null => normalizeId(value);

export const normalizeFlightPlanSlideInputs = (value: unknown): FlightPlanGallerySlideWrite[] => {
  if (!Array.isArray(value)) return [];
  const slides: FlightPlanGallerySlideWrite[] = [];
  const seenLabels = new Set<string>();

  for (const entry of value) {
    if (slides.length >= MAX_FLIGHT_PLAN_SLIDES) break;
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const galleryImage = normalizeGalleryImageId(record.galleryImage ?? record.galleryImageId ?? record.assetId);
    const imageType = deduceImageType(record.imageType, Boolean(galleryImage));
    const imageAlt = normalizeSlideString(record.imageAlt);
    const imageUrl = normalizeSlideUrl(record.imageUrl ?? record.image);
    const mediaType = deduceGalleryMediaType({
      mediaType: record.mediaType,
      url: imageUrl,
    });

    if (!imageAlt) {
      continue;
    }

    if (imageType === 'url' && !imageUrl) {
      continue;
    }

    if (imageType === 'upload' && !galleryImage && !imageUrl) {
      continue;
    }

    const rawLabel = normalizeSlideString(record.label);
    let label = rawLabel ?? null;
    if (label) {
      const key = label.toLowerCase();
      if (seenLabels.has(key)) {
        label = null;
      } else {
        seenLabels.add(key);
      }
    }

    slides.push({
      label,
      title: normalizeSlideString(record.title),
      caption: normalizeSlideString(record.description ?? record.caption),
      creditLabel: normalizeSlideString(record.creditLabel),
      creditUrl: normalizeSlideUrl(record.creditUrl),
      mediaType,
      imageAlt,
      imageUrl: imageUrl ?? '',
      imageType,
      galleryImage,
    });
  }

  return slides;
};

export const resolveOwners = async (
  payload: Payload,
  docs: DocWithOwner[],
  preload: Map<number, CrewSummary> = new Map(),
): Promise<Map<number, CrewSummary>> => {
  const ownerIds = new Set<number>();

  for (const doc of docs) {
    const ownerId = normalizeId(doc.owner ?? null);
    if (ownerId != null && !preload.has(ownerId)) {
      ownerIds.add(ownerId);
    }

    const statusChangedById = normalizeId(doc.statusChangedBy ?? null);
    if (statusChangedById != null && !preload.has(statusChangedById)) {
      ownerIds.add(statusChangedById);
    }
  }

  if (!ownerIds.size) {
    return preload;
  }

  const result = await payload.find({
    collection: 'users',
    where: {
      id: {
        in: Array.from(ownerIds),
      },
    },
    limit: ownerIds.size,
    depth: 0,
    overrideAccess: true,
  });

  const summaries = new Map(preload);
  for (const doc of result.docs) {
    const summary = toCrewSummary(doc);
    if (summary) {
      summaries.set(doc.id, summary);
    }
  }

  return summaries;
};

export type LogSummary = {
  id: number;
  title: string;
  slug: string;
  path: string;
  href: string;
  body: string | null;
  dateCode: string | null;
  logDate: string | null;
  headline: string | null;
  createdAt: string;
  updatedAt: string;
  tagline: string | null;
  summary: string | null;
  excerpt: string | null;
  displayLabel: string | null;
  owner: CrewSummary | null;
  flightPlanId: number | null;
  flightPlanTombstone: {
    id: number | null;
    slug: string | null;
    title: string | null;
    location: string | null;
    displayDate: string | null;
    deletedAt: string | null;
  } | null;
};

const deriveDateLabel = (log: Log): string | null => {
  const tagline = getLogField(log, 'tagline');
  const candidates = [log.dateCode, log.slug, log.path, tagline];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const digits = candidate.replace(/[^0-9]/g, '');
    if (digits.length >= 8) {
      return digits.slice(-8);
    }
    if (digits.length) {
      return digits;
    }
  }
  return null;
};

const createExcerpt = (value: string | null | undefined, limit = 180): string | null => {
  if (typeof value !== 'string') return null;
  const plain = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  });
  const stripped = plain.replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return null;
  if (stripped.length <= limit) return stripped;
  return `${stripped.slice(0, limit).trimEnd()}…`;
};

const sanitizeLogTombstone = (value: unknown): LogSummary['flightPlanTombstone'] => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = normalizeId(record.id);
  const slug = typeof record.slug === 'string' && record.slug.trim().length > 0 ? record.slug : null;
  const title = typeof record.title === 'string' && record.title.trim().length > 0 ? record.title : null;
  const location =
    typeof record.location === 'string' && record.location.trim().length > 0 ? record.location : null;
  const displayDate =
    typeof record.displayDate === 'string' && record.displayDate.trim().length > 0
      ? record.displayDate
      : null;
  const deletedAt =
    typeof record.deletedAt === 'string' && record.deletedAt.trim().length > 0 ? record.deletedAt : null;
  if (![id, slug, title, location, displayDate, deletedAt].some((entry) => entry != null)) {
    return null;
  }
  return {
    id,
    slug,
    title,
    location,
    displayDate,
    deletedAt,
  };
};

export const sanitizeLog = (log: Log, ownerMap: Map<number, CrewSummary>): LogSummary => {
  const ownerId = normalizeId(log.owner);
  const ownerSummary = ownerId != null ? ownerMap.get(ownerId) ?? null : null;
  const dateLabel = deriveDateLabel(log);
  const parsedTitle = parseLogTitle(log.title);
  const labelStamp = parsedTitle.stamp ?? dateLabel;
  const noteFragment = parsedTitle.note ? ` – ${parsedTitle.note}` : '';
  const displayLabel = labelStamp ? `Log ${labelStamp}${noteFragment}` : 'Log entry';
  return {
    id: log.id,
    title: log.title,
    slug: log.slug,
    path: log.path,
    href: `/${log.path}`.replace(/\/+/g, '/'),
    body: typeof log.body === 'string' ? log.body : null,
    dateCode: log.dateCode ?? null,
    logDate: log.logDate ?? null,
    headline: typeof log.headline === 'string' ? log.headline : null,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    tagline: getLogField(log, 'tagline'),
    summary: getLogField(log, 'summary'),
    excerpt: createExcerpt(log.body),
    displayLabel,
    owner: ownerSummary,
    flightPlanId: normalizeId((log as any).flightPlan ?? null),
    flightPlanTombstone: sanitizeLogTombstone((log as any).flightPlanTombstone),
  };
};

export type FlightPlanSummary = {
  id: number;
  title: string;
  slug: string;
  path: string;
  href: string;
  summary: string | null;
  body: RichTextContent;
  category: 'test' | 'project' | 'event';
  status: 'planned' | 'pending' | 'ongoing' | 'on-hold' | 'postponed' | 'success' | 'failure' | 'aborted' | 'cancelled';
  statusBucket: 'active' | 'finished' | 'archived';
  statusChangedAt: string | null;
  statusChangedBy: CrewSummary | null;
  statusReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  series: {
    id: number;
    slug: string;
    title: string;
    category: 'test' | 'project' | 'event';
  } | null;
  iterationNumber: number;
  previousIterationId: number | null;
  location: string | null;
  dateCode: string | null;
  displayDate: string | null;
  eventDate: string | null;
  date: string | null;
  createdAt: string;
  updatedAt: string;
  owner: CrewSummary | null;
  crewPreview: CrewSummary[];
  accessPolicy: AccessPolicy | null;
  visibility: FlightPlanVisibilityLevel;
  mediaVisibility: 'inherit' | 'crew_only';
  crewCanPromotePassengers: boolean;
  passengersCanCreateTasks: boolean;
  isPublic: boolean;
  publicContributions: boolean;
  gallerySlides: FlightPlanGallerySlide[];
};

export const sanitizeFlightPlan = (
  plan: FlightPlan,
  ownerMap: Map<number, CrewSummary>,
  crewPreviewMap?: Map<number, number[]>,
): FlightPlanSummary => {
  const planId = normalizeId(plan.id);
  const ownerId = normalizeId(plan.owner);
  const ownerSummary = ownerId != null ? ownerMap.get(ownerId) ?? null : null;
  const body = normalizeRichTextContent(plan.body);
  const bodyPlain = richTextToPlainText(body);
  const summary =
    typeof plan.summary === 'string' && plan.summary.trim().length > 0
      ? plan.summary
      : bodyPlain
        ? createExcerpt(bodyPlain)
        : null;
  const ownerSlug = ownerSummary?.profileSlug ?? null;
  const slugValue = typeof plan.slug === 'string' && plan.slug.length ? plan.slug : null;
  const normalizedPath = typeof plan.path === 'string' ? plan.path : '';
  const slugFromPath = (() => {
    const value = typeof plan.path === 'string' ? plan.path : null;
    if (!value) return null;
    const segments = value.split('/').filter((segment) => segment.trim().length > 0);
    return segments.length ? segments[segments.length - 1] : null;
  })();
  const canonicalSlug = slugValue ?? slugFromPath ?? null;
  const sanitizedHref = canonicalSlug ? `/bridge/flight-plans/${canonicalSlug}` : '/bridge/flight-plans';
  const gallerySlides = normalizeFlightPlanSlides(
    (plan as unknown as { gallerySlides?: unknown }).gallerySlides,
  );
  const accessPolicy = resolveFlightPlanPolicy({
    policy: (plan as unknown as { accessPolicy?: unknown }).accessPolicy as any,
    visibility: (plan as unknown as { visibility?: unknown }).visibility,
    isPublic: (plan as unknown as { isPublic?: unknown }).isPublic,
    publicContributions: (plan as unknown as { publicContributions?: unknown }).publicContributions,
  });
  const visibility = deriveFlightPlanVisibility(accessPolicy);
  const normalizedStatus = normaliseFlightPlanLifecycleStatus(
    (plan as unknown as { status?: unknown }).status,
  );
  const status = normalizedStatus?.status ?? 'planned';
  const statusChangedById = normalizeId(
    (plan as unknown as { statusChangedBy?: unknown }).statusChangedBy,
  );
  const statusChangedBy = statusChangedById != null ? ownerMap.get(statusChangedById) ?? null : null;
  const seriesValue = (plan as unknown as { series?: unknown }).series;
  const seriesRecord =
    seriesValue && typeof seriesValue === 'object'
      ? (seriesValue as {
          id?: unknown;
          slug?: unknown;
          title?: unknown;
          category?: unknown;
        })
      : null;
  const series =
    seriesRecord &&
    normalizeId(seriesRecord.id) != null &&
    typeof seriesRecord.slug === 'string' &&
    typeof seriesRecord.title === 'string'
      ? {
          id: normalizeId(seriesRecord.id) as number,
          slug: seriesRecord.slug,
          title: seriesRecord.title,
          category: (
            seriesRecord.category === 'event'
              ? 'event'
              : seriesRecord.category === 'test'
                ? 'test'
                : 'project'
          ) as 'test' | 'project' | 'event',
        }
      : null;
  const iterationNumberRaw = (plan as unknown as { iterationNumber?: unknown }).iterationNumber;
  const iterationNumber =
    typeof iterationNumberRaw === 'number' && Number.isFinite(iterationNumberRaw) && iterationNumberRaw > 0
      ? Math.trunc(iterationNumberRaw)
      : 1;
  const previousIterationId = normalizeId(
    (plan as unknown as { previousIteration?: unknown }).previousIteration,
  );

  return {
    id: plan.id,
    title: plan.title,
    slug: plan.slug,
    path: plan.path,
    href: sanitizedHref,
    summary,
    body,
    category:
      (typeof (plan as any)?.category === 'string' &&
        ['test', 'project', 'event'].includes((plan as any).category)) ?
        ((plan as any).category as 'test' | 'project' | 'event') :
        'project',
    status,
    statusBucket: deriveFlightPlanLifecycleBucket(status),
    statusChangedAt:
      typeof (plan as unknown as { statusChangedAt?: unknown }).statusChangedAt === 'string'
        ? ((plan as unknown as { statusChangedAt?: string | null }).statusChangedAt ?? null)
        : null,
    statusChangedBy,
    statusReason:
      typeof (plan as unknown as { statusReason?: unknown }).statusReason === 'string'
        ? ((plan as unknown as { statusReason?: string | null }).statusReason ?? null)
        : null,
    startedAt:
      typeof (plan as unknown as { startedAt?: unknown }).startedAt === 'string'
        ? ((plan as unknown as { startedAt?: string | null }).startedAt ?? null)
        : null,
    finishedAt:
      typeof (plan as unknown as { finishedAt?: unknown }).finishedAt === 'string'
        ? ((plan as unknown as { finishedAt?: string | null }).finishedAt ?? null)
        : null,
    series,
    iterationNumber,
    previousIterationId,
    location: plan.location ?? null,
    dateCode: plan.dateCode ?? null,
    displayDate: plan.displayDate ?? null,
    eventDate: plan.eventDate ?? null,
    date: plan.eventDate ?? plan.displayDate ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    owner: ownerSummary,
    crewPreview:
      planId != null
        ? (() => {
            const crewIds = crewPreviewMap?.get(planId) ?? [];
            const preview: CrewSummary[] = [];
            for (const crewId of crewIds) {
              const entry = ownerMap.get(crewId);
              if (entry && !preview.some((member) => member.id === entry.id)) {
                preview.push(entry);
              }
            }
            if (!preview.length && ownerSummary) {
              preview.push(ownerSummary);
            }
            return preview;
          })()
          : ownerSummary
            ? [ownerSummary]
            : [],
    accessPolicy,
    visibility,
    mediaVisibility: resolveFlightPlanMediaVisibility(
      (plan as unknown as { mediaVisibility?: unknown }).mediaVisibility,
    ),
    crewCanPromotePassengers: Boolean(
      (plan as unknown as { crewCanPromotePassengers?: unknown }).crewCanPromotePassengers,
    ),
    passengersCanCreateTasks: Boolean(
      (plan as unknown as { passengersCanCreateTasks?: unknown }).passengersCanCreateTasks,
    ),
    isPublic: Boolean((plan as unknown as { isPublic?: unknown }).isPublic),
    publicContributions: Boolean((plan as unknown as { publicContributions?: unknown }).publicContributions),
    gallerySlides,
  };
};
