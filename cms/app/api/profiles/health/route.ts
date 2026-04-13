import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '../../_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
