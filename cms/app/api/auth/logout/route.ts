import { NextRequest, NextResponse } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';

import { applyCors, corsEmpty, corsJson } from '../../_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const payload = await getPayloadInstance();
  const response = NextResponse.json({ message: 'Logged out.' });

  const cookiePrefix = payload.config.cookiePrefix ?? 'payload';
  const cookieName = `${cookiePrefix}-token`;

  response.cookies.set(cookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: payload.config.serverURL?.startsWith('https://') ?? false,
    path: '/',
    expires: new Date(0),
  });

  return applyCors(response, 'OPTIONS,POST', req);
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 'OPTIONS,POST');
}
