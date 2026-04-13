import type { User } from '@/payload-types';
import {
  HONOR_BADGE_DEFINITIONS,
  HONOR_BADGE_CODE_SET,
  type HonorBadgeCode,
  type HonorBadgeDefinition,
  type HonorBadgeRecord,
  type HonorBadgeSource,
} from '@astralpirates/shared/honorBadges';

type HonorBadgeDraft = Partial<HonorBadgeRecord>;

const HONOR_BADGE_SOURCES: HonorBadgeSource[] = ['automatic', 'manual'];

const toHonorBadgeSource = (value: unknown): HonorBadgeSource =>
  HONOR_BADGE_SOURCES.includes(value as HonorBadgeSource) ? (value as HonorBadgeSource) : 'automatic';

const parseDateInput = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const toIsoString = (value: Date | null | undefined, fallback: Date): string =>
  (value ?? fallback).toISOString();

const normaliseBadgeEntry = (value: unknown): HonorBadgeRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as HonorBadgeDraft;
  const code = typeof entry.code === 'string' ? (entry.code.trim().toLowerCase() as HonorBadgeCode) : null;
  if (!code || !HONOR_BADGE_CODE_SET.has(code)) return null;
  const awardedAtDate = parseDateInput(entry.awardedAt);
  const fallbackDate = parseDateInput(new Date())!;
  const note =
    typeof entry.note === 'string'
      ? entry.note.trim() || null
      : entry.note == null
        ? null
        : String(entry.note);

  return {
    code,
    awardedAt: toIsoString(awardedAtDate, fallbackDate),
    source: toHonorBadgeSource(entry.source),
    note,
  };
};

const normaliseBadgeList = (value: unknown): HonorBadgeRecord[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normaliseBadgeEntry(entry))
    .filter((entry): entry is HonorBadgeRecord => Boolean(entry));
};

const dedupeByCode = (entries: HonorBadgeRecord[]): HonorBadgeRecord[] => {
  const map = new Map<HonorBadgeCode, HonorBadgeRecord>();
  entries.forEach((entry) => {
    if (!HONOR_BADGE_CODE_SET.has(entry.code)) return;
    map.set(entry.code, entry);
  });
  return Array.from(map.values());
};

const badgeCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const sortHonorBadges = (entries: HonorBadgeRecord[]): HonorBadgeRecord[] =>
  [...entries].sort((a, b) => {
    const aTime = Date.parse(a.awardedAt);
    const bTime = Date.parse(b.awardedAt);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return badgeCollator.compare(a.code, b.code);
    }
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    if (aTime === bTime) return badgeCollator.compare(a.code, b.code);
    return aTime - bTime;
  });

const matchesEligibility = (definition: HonorBadgeDefinition, enlistedAt: Date | null): boolean => {
  if (!definition.eligibility?.length) return false;
  return definition.eligibility.some((rule) => {
    if (rule.type === 'enlistmentYear') {
      if (!enlistedAt) return false;
      return enlistedAt.getUTCFullYear() === rule.year;
    }
    return false;
  });
};

const resolveEnlistmentDate = (
  draft: Partial<User>,
  previous: Partial<User> | null | undefined,
  fallback: Date,
): Date | null =>
  parseDateInput((draft as Partial<User> & { createdAt?: string | Date | null })?.createdAt) ??
  parseDateInput((previous as Partial<User> & { createdAt?: string | Date | null })?.createdAt) ??
  fallback;

export const evaluateAutomaticHonorBadges = (
  user: Partial<User>,
  existingAutomatic: HonorBadgeRecord[] = [],
  options: { now?: Date; enlistedAt?: Date | null } = {},
): HonorBadgeRecord[] => {
  const now = options.now ?? new Date();
  const enlistedAt =
    parseDateInput((user as Partial<User> & { createdAt?: string | Date | null })?.createdAt) ??
    options.enlistedAt ??
    now;

  const existingByCode = new Map<HonorBadgeCode, HonorBadgeRecord>();
  existingAutomatic.forEach((entry) => existingByCode.set(entry.code, entry));

  const automaticAwards: HonorBadgeRecord[] = [];

  Object.values(HONOR_BADGE_DEFINITIONS).forEach((definition) => {
    if (!matchesEligibility(definition, enlistedAt)) return;
    const previous = existingByCode.get(definition.code);
    automaticAwards.push({
      code: definition.code,
      source: 'automatic',
      awardedAt: previous?.awardedAt ?? toIsoString(enlistedAt, now),
      note: previous?.note ?? null,
    });
  });

  return sortHonorBadges(automaticAwards);
};

export const syncHonorBadges = ({
  draft,
  previous,
  now = new Date(),
}: {
  draft: Partial<User>;
  previous?: Partial<User> | null;
  now?: Date;
}): HonorBadgeRecord[] => {
  const previousEntries = normaliseBadgeList((previous as any)?.honorBadges);
  const draftEntries = normaliseBadgeList((draft as any)?.honorBadges);

  const manualEntries = dedupeByCode(
    [...previousEntries, ...draftEntries].filter((entry) => entry.source === 'manual'),
  );

  const automaticEntries = evaluateAutomaticHonorBadges(
    draft,
    previousEntries.filter((entry) => entry.source === 'automatic'),
    {
      now,
      enlistedAt: resolveEnlistmentDate(draft, previous, now),
    },
  );

  const manualCodes = new Set(manualEntries.map((entry) => entry.code));
  const filteredAutomatic = automaticEntries.filter((entry) => !manualCodes.has(entry.code));

  return sortHonorBadges([...manualEntries, ...filteredAutomatic]);
};

export const honorBadgesEqual = (
  left: HonorBadgeRecord[] | null | undefined,
  right: HonorBadgeRecord[] | null | undefined,
): boolean => {
  const lhs = sortHonorBadges(left ?? []);
  const rhs = sortHonorBadges(right ?? []);
  if (lhs.length !== rhs.length) return false;
  for (let i = 0; i < lhs.length; i += 1) {
    const a = lhs[i];
    const b = rhs[i];
    if (a.code !== b.code) return false;
    if (a.source !== b.source) return false;
    if (a.awardedAt !== b.awardedAt) return false;
    if ((a.note ?? null) !== (b.note ?? null)) return false;
  }
  return true;
};

export type { HonorBadgeRecord } from '@astralpirates/shared/honorBadges';
