import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET,POST';

export async function GET(
  req: NextRequest,
  _context: { params: Promise<{ slug: string; taskId: string }> },
) {
  return corsJson(
    req,
    { error: 'Task comments are disabled. Use modular comment threads for discussions.' },
    { status: 410 },
    METHODS,
  );
}

export async function POST(
  req: NextRequest,
  _context: { params: Promise<{ slug: string; taskId: string }> },
) {
  return corsJson(
    req,
    { error: 'Task comments are disabled. Use modular comment threads for discussions.' },
    { status: 410 },
    METHODS,
  );
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
