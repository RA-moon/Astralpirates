import type { CollectionSlug, Payload } from 'payload';

const DEFAULT_MAX_ATTEMPTS = 20;

type EnsureSlugOptions = {
  maxAttempts?: number;
};

const sanitiseGeneralSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const isDigitsOnly = (value: string): boolean => /^[0-9]+$/.test(value);

const nextNumericSlug = (base: string, attempt: number): string => {
  const numeric = BigInt(base);
  const candidate = numeric + BigInt(attempt);
  return candidate.toString().padStart(base.length, '0');
};

export const ensureUniqueSlug = async (
  payload: Payload,
  collection: CollectionSlug,
  baseSlug: string,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS }: EnsureSlugOptions = {},
) => {
  const trimmed = baseSlug.trim();
  const digitsOnly = isDigitsOnly(trimmed);
  const safeBase = digitsOnly ? trimmed : sanitiseGeneralSlug(trimmed);
  if (!safeBase) throw new Error('Unable to generate a slug. Provide a longer title or date.');

  let attempt = 0;
  let candidate = safeBase;

  while (attempt < maxAttempts) {
    const existing = await payload.find({
      collection,
      where: {
        slug: {
          equals: candidate,
        },
      },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    if (existing.totalDocs === 0) {
      return candidate;
    }

    attempt += 1;
    candidate = digitsOnly ? nextNumericSlug(safeBase, attempt) : `${safeBase}-${attempt + 1}`;
  }

  throw new Error('Unable to generate a unique slug after multiple attempts.');
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
