import { GRAPHQL_PLAYGROUND_GET, GRAPHQL_POST } from '@payloadcms/next/routes';

import { payloadConfigPromise } from '../../lib/payload.ts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = GRAPHQL_PLAYGROUND_GET(payloadConfigPromise);
export const POST = GRAPHQL_POST(payloadConfigPromise);
