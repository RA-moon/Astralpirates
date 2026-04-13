import { randomBytes } from 'node:crypto';

const SLUG_SAFE_REGEX = /[^a-z0-9]+/g;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SLUG_SAFE_REGEX, '-')
    .replace(/(^-|-$)+/g, '')
    .replace(/-{2,}/g, '-');

const randomChars = (size = 4): string => randomBytes(size).toString('hex');

export const makeTemporaryProfileSlug = (): string => `temp-${randomChars(3)}`;

export const looksLikeTemporarySlug = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.startsWith('temp-');

export const makeProfileSlugFromCallSign = (callSign: string): string => {
  const normalized = slugify(callSign.trim());
  if (!normalized) {
    throw new Error('Call sign must contain at least one letter or number.');
  }
  return normalized;
};

export const normalizeProfileSlugInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const slug = slugify(value);
  return slug || null;
};
