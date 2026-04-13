import type { NextRequest } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';
import { makeProfileSlugFromCallSign } from '@/src/utils/profileSlug';
import { corsEmpty, corsJson } from '../../_lib/cors';

const METHODS = 'OPTIONS,GET';

const sanitizeCallSign = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 48) return null;
  if (!/^[\p{L}\p{N}'\-\s]+$/u.test(trimmed)) return null;
  return trimmed;
};

const buildSuggestion = async (payload: Awaited<ReturnType<typeof getPayloadInstance>>, base: string) => {
  const attempts = 10;

  for (let index = 1; index <= attempts; index += 1) {
    const candidateCallSign = `${base} ${index}`;
    const candidateSlug = makeProfileSlugFromCallSign(candidateCallSign);
    const existing = await payload.find({
      collection: 'users',
      where: { profileSlug: { equals: candidateSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existing.totalDocs === 0) {
      return candidateCallSign;
    }
  }
  return null;
};

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const raw = searchParams.get('callSign') ?? searchParams.get('value');
  const callSign = sanitizeCallSign(raw);

  if (!callSign) {
    return corsJson(
      req,
      { available: false, error: 'Call sign must be 2-48 characters using letters, numbers, spaces, apostrophes, or hyphens.' },
      { status: 400 },
      METHODS,
    );
  }

  const payload = await getPayloadInstance();
  const slug = makeProfileSlugFromCallSign(callSign);
  const existing = await payload.find({
    collection: 'users',
    where: { profileSlug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.totalDocs === 0) {
    return corsJson(
      req,
      { available: true, callSign, profileSlug: slug, suggestion: null },
      {},
      METHODS,
    );
  }

  const suggestion = await buildSuggestion(payload, callSign);

  return corsJson(
    req,
    {
      available: false,
      callSign,
      profileSlug: slug,
      suggestion,
    },
    { status: 409 },
    METHODS,
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
