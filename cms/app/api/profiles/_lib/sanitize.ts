import type { Payload } from 'payload';

import type { User } from '@/payload-types';
import type { HonorBadge } from '@astralpirates/shared/api-contracts';
import { resolveEffectiveAdminMode } from '@astralpirates/shared/adminMode';
import {
  resolveHonorBadgeDefinition,
  type HonorBadgeCode,
  type HonorBadgeRecord,
} from '@astralpirates/shared/honorBadges';
import {
  extractAvatarFilenameFromUrl,
  resolveAvatarMimeTypeFromFilename,
  type AvatarMediaType,
} from '@astralpirates/shared/avatarMedia';
import { HONOR_BADGE_MEDIA_PROXY_PATH } from '@astralpirates/shared/mediaUrls';
import { buildMediaFileUrl } from '@/src/storage/mediaConfig';
import { resolveAvatarMediaMetadata } from './avatar';

export type PublicProfile = {
  id: number;
  role: User['role'];
  profileSlug: string;
  callSign: string | null;
  pronouns: string | null;
  avatarUrl: string | null;
  avatarMediaType: AvatarMediaType;
  avatarMediaUrl: string | null;
  avatarMimeType: string | null;
  avatarFilename: string | null;
  bio: string | null;
  skills: { label: string }[];
  links: { label: string; url: string }[];
  honorBadges: HonorBadge[];
  lastActiveAt: string | null;
  currentRoute: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrivateProfile = PublicProfile & {
  email: string;
  firstName: string | null;
  lastName: string | null;
  adminModePreferences: {
    adminViewEnabled: boolean;
    adminEditEnabled: boolean;
  };
};

const sanitizeSkills = (user: User) =>
  Array.isArray(user.skills)
    ? user.skills
        .filter((entry): entry is { label: string } => Boolean(entry?.label))
        .map((entry) => ({ label: entry.label }))
    : [];

const sanitizeLinks = (user: User) =>
  Array.isArray(user.links)
    ? user.links
        .filter((entry): entry is { label: string; url: string } => Boolean(entry?.label && entry?.url))
        .map((entry) => ({ label: entry.label, url: entry.url }))
    : [];

type SanitizeOptions = {
  payload?: Payload | null;
  honorBadgeMediaByCode?: HonorBadgeMediaByCode | null;
};

type HonorBadgeMediaMetadata = {
  iconMediaUrl: string;
  iconMimeType: string | null;
  iconFilename: string | null;
};

export type HonorBadgeMediaByCode = Map<HonorBadgeCode, HonorBadgeMediaMetadata>;

const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toAbsoluteUrl = (
  payload: Payload | null | undefined,
  value: string | null | undefined,
): string | null => {
  const candidate = trimToNull(value);
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const serverUrl = payload?.config?.serverURL ?? process.env.PAYLOAD_PUBLIC_SERVER_URL ?? null;
  if (!serverUrl) return candidate;
  try {
    return new URL(candidate, serverUrl).href;
  } catch {
    return candidate;
  }
};

const toHonorBadgeCode = (value: unknown): HonorBadgeCode | null =>
  resolveHonorBadgeDefinition(value)?.code ?? null;

const resolveHonorBadgeMediaMetadata = (
  payload: Payload | null | undefined,
  doc: unknown,
): HonorBadgeMediaMetadata | null => {
  if (!doc || typeof doc !== 'object') return null;
  const record = doc as { url?: unknown; filename?: unknown; mimeType?: unknown };
  const filenameFromDoc = trimToNull(record.filename);
  const rawUrl = trimToNull(record.url);
  const proxyUrl = filenameFromDoc
    ? `${HONOR_BADGE_MEDIA_PROXY_PATH}${filenameFromDoc.replace(/^\/+/, '')}`
    : null;
  const fallbackUrl = filenameFromDoc ? buildMediaFileUrl('badges', filenameFromDoc) : null;
  const iconMediaUrl = toAbsoluteUrl(payload, proxyUrl ?? rawUrl ?? fallbackUrl);
  if (!iconMediaUrl) return null;
  const iconFilename = filenameFromDoc ?? extractAvatarFilenameFromUrl(iconMediaUrl);
  const iconMimeType =
    trimToNull(record.mimeType) ?? resolveAvatarMimeTypeFromFilename(iconFilename);
  return {
    iconMediaUrl,
    iconMimeType,
    iconFilename,
  };
};

const collectHonorBadgeCodes = (users: User[]): HonorBadgeCode[] => {
  const set = new Set<HonorBadgeCode>();
  users.forEach((user) => {
    const entries = Array.isArray((user as any).honorBadges)
      ? ((user as any).honorBadges as HonorBadgeRecord[])
      : [];
    entries.forEach((entry) => {
      const code = toHonorBadgeCode(entry?.code);
      if (code) set.add(code);
    });
  });
  return Array.from(set.values());
};

export const resolveHonorBadgeMediaByCode = async ({
  payload,
  users,
}: {
  payload?: Payload | null;
  users: User[];
}): Promise<HonorBadgeMediaByCode> => {
  const map: HonorBadgeMediaByCode = new Map();
  if (!payload || users.length === 0) return map;

  const badgeCodes = collectHonorBadgeCodes(users);
  if (badgeCodes.length === 0) return map;

  try {
    const result = await payload.find({
      collection: 'honor-badge-media',
      where: {
        badgeCode: {
          in: badgeCodes,
        },
      },
      sort: '-updatedAt',
      depth: 0,
      limit: Math.max(20, badgeCodes.length * 4),
      overrideAccess: true,
    });

    for (const doc of result.docs ?? []) {
      const code = toHonorBadgeCode((doc as { badgeCode?: unknown }).badgeCode);
      if (!code || map.has(code)) continue;
      const metadata = resolveHonorBadgeMediaMetadata(payload, doc);
      if (!metadata) continue;
      map.set(code, metadata);
    }
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, badgeCodes },
      '[profiles/sanitize] failed to resolve upload-backed honor badge media',
    );
  }

  return map;
};

const sanitizeHonorBadgeEntry = (
  entry: HonorBadgeRecord,
  options: SanitizeOptions,
): HonorBadge | null => {
  const definition = resolveHonorBadgeDefinition(entry.code);
  if (!definition) return null;

  const uploadMedia = options.honorBadgeMediaByCode?.get(definition.code) ?? null;
  const iconMediaUrl = uploadMedia?.iconMediaUrl ?? null;
  const iconUrl = iconMediaUrl ?? definition.iconPath;
  const iconFilename =
    uploadMedia?.iconFilename ??
    extractAvatarFilenameFromUrl(iconMediaUrl ?? iconUrl) ??
    null;
  const iconMimeType =
    uploadMedia?.iconMimeType ??
    resolveAvatarMimeTypeFromFilename(iconFilename) ??
    null;

  return {
    code: definition.code,
    label: definition.label,
    description: definition.description,
    tooltip: definition.tooltip ?? definition.label,
    iconUrl,
    iconMediaUrl,
    iconMimeType,
    iconFilename,
    rarity: definition.rarity ?? null,
    awardedAt: entry.awardedAt,
    source: entry.source,
    note: entry.note ?? null,
  };
};

const sanitizeHonorBadges = (user: User, options: SanitizeOptions): HonorBadge[] => {
  const entries = Array.isArray((user as any).honorBadges)
    ? ((user as any).honorBadges as HonorBadgeRecord[])
    : [];
  return entries
    .map((entry) => sanitizeHonorBadgeEntry(entry, options))
    .filter((entry): entry is HonorBadge => Boolean(entry));
};

const sanitizeAdminModePreferences = (user: User): PrivateProfile['adminModePreferences'] => {
  const effective = resolveEffectiveAdminMode({
    role: user.role ?? null,
    adminViewRequested: (user as any).adminModeViewPreference,
    adminEditRequested: (user as any).adminModeEditPreference,
  });

  return {
    adminViewEnabled: effective.adminViewEnabled,
    adminEditEnabled: effective.adminEditEnabled,
  };
};

export const sanitizePublicProfile = (user: User, options: SanitizeOptions = {}): PublicProfile => {
  const avatarMedia = resolveAvatarMediaMetadata({
    payload: options.payload,
    uploadDoc: user.avatar,
    avatarUrl: user.avatarUrl ?? null,
    avatarMediaType: (user as any).avatarMediaType,
  });

  return {
    id: user.id,
    role: user.role,
    profileSlug: user.profileSlug,
    callSign: user.callSign ?? null,
    pronouns: user.pronouns ?? null,
    avatarUrl: avatarMedia.avatarUrl,
    avatarMediaType: avatarMedia.avatarMediaType,
    avatarMediaUrl: avatarMedia.avatarMediaUrl,
    avatarMimeType: avatarMedia.avatarMimeType,
    avatarFilename: avatarMedia.avatarFilename,
    bio: user.bio ?? null,
    skills: sanitizeSkills(user),
    links: sanitizeLinks(user),
    honorBadges: sanitizeHonorBadges(user, options),
    lastActiveAt: (user as any).lastActiveAt ?? null,
    currentRoute: (user as any).currentRoute ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const sanitizePrivateProfile = (user: User, options: SanitizeOptions = {}): PrivateProfile => ({
  ...sanitizePublicProfile(user, options),
  email: user.email,
  firstName: user.firstName ?? null,
  lastName: user.lastName ?? null,
  adminModePreferences: sanitizeAdminModePreferences(user),
});
