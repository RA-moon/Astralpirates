import type { NextRequest } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';

import { corsEmpty, corsJson } from '../../_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const payload = await getPayloadInstance();

  try {
    await payload.find({
      collection: 'pages',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
  } catch (error) {
    payload.logger.error({ err: error }, 'Pages health check failed');
    return corsJson(
      req,
      {
        ok: false,
        error: 'Failed to query pages collection.',
      },
      { status: 500 },
      'OPTIONS,GET',
    );
  }

  return corsJson(
    req,
    {
      ok: true,
    },
    { status: 200 },
    'OPTIONS,GET',
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 'OPTIONS,GET');
}
