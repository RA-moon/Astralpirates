import type { NextRequest } from 'next/server';

import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes';

import { RoadmapResponseSchema, RoadmapTiersCmsResponseSchema } from '@astralpirates/shared/api-contracts';
import { normalizeRoadmapCmsResponse } from '@astralpirates/shared/roadmap';

import { canUserReadCrewPolicy } from '../_lib/accessPolicy';
import { authenticateRequest } from '../_lib/auth';
import { corsEmpty, corsJson } from '../_lib/cors';

import { payloadConfigPromise } from '../../lib/payload.ts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROADMAP_METHODS = 'OPTIONS,GET';
const ROADMAP_CACHE_CONTROL = 'private, no-store';
const ROADMAP_DEFAULT_ACCESS_POLICY = {
  mode: 'role',
  roleSpace: 'crew',
  minimumRole: 'swabbie',
} as const;

type PayloadRouteContext = {
  params: Promise<{
    slug?: string[];
  }>;
};

const normalisePayloadAuthRequest = (request: Request): Request => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return request;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return request;

  const token = match[1]?.trim();
  if (!token) return request;

  const headers = new Headers(request.headers);
  headers.set('Authorization', `JWT ${token}`);
  return new Request(request, { headers });
};

const wrapHandler = <T extends (...args: any[]) => any>(handler: T) => {
  return (async (request: Request, context: unknown) =>
    handler(normalisePayloadAuthRequest(request), context)) as T;
};

const isRoadmapRequest = async (context: PayloadRouteContext): Promise<boolean> => {
  const params = await context.params;
  const slug = params?.slug;
  return Array.isArray(slug) && slug.length === 1 && slug[0] === 'roadmap';
};

const handleRoadmapGet = async (req: NextRequest) => {
  try {
    const { payload, user, adminMode } = await authenticateRequest(req);
    const roadmapTiers = await payload.find({
      collection: 'roadmap-tiers',
      depth: 1,
      limit: 50,
      sort: 'tierId',
      overrideAccess: true,
    });

    const parsed = RoadmapTiersCmsResponseSchema.safeParse(roadmapTiers);
    if (!parsed.success) {
      payload.logger?.error?.({ err: parsed.error }, 'Invalid roadmap-tiers response');
      const response = corsJson(
        req,
        { error: 'Invalid roadmap response.' },
        { status: 500 },
        ROADMAP_METHODS,
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const filteredDocs = parsed.data.docs
      .map((tier) => {
        const tierPolicy = tier.accessPolicy ?? ROADMAP_DEFAULT_ACCESS_POLICY;
        const canReadTier = canUserReadCrewPolicy({
          policy: tier.accessPolicy,
          user,
          fallbackPolicy: ROADMAP_DEFAULT_ACCESS_POLICY,
          adminMode,
        });

        if (!canReadTier) return null;

        const filteredItems = (tier.items ?? []).filter((item) =>
          canUserReadCrewPolicy({
            policy: item.accessPolicy,
            user,
            fallbackPolicy: tierPolicy,
            adminMode,
          }),
        );

        return {
          ...tier,
          items: filteredItems,
        };
      })
      .filter((tier): tier is NonNullable<typeof tier> => Boolean(tier));

    const normalized = normalizeRoadmapCmsResponse({
      ...parsed.data,
      docs: filteredDocs,
    });
    const validated = RoadmapResponseSchema.safeParse(normalized);
    if (!validated.success) {
      payload.logger?.error?.({ err: validated.error }, 'Invalid /api/roadmap response');
      const response = corsJson(
        req,
        { error: 'Invalid roadmap response.' },
        { status: 500 },
        ROADMAP_METHODS,
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const response = corsJson(req, validated.data, { status: 200 }, ROADMAP_METHODS);
    response.headers.set('Cache-Control', ROADMAP_CACHE_CONTROL);
    return response;
  } catch (error) {
    console.error('[api/roadmap] Failed to build roadmap response:', error);
    const response = corsJson(req, { error: 'Unable to load roadmap.' }, { status: 500 }, ROADMAP_METHODS);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
};

const payloadOPTIONS = wrapHandler(REST_OPTIONS(payloadConfigPromise));
const payloadGET = wrapHandler(REST_GET(payloadConfigPromise));

export const OPTIONS = async (request: Request, context: PayloadRouteContext) => {
  if (await isRoadmapRequest(context)) {
    return corsEmpty(request as NextRequest, ROADMAP_METHODS);
  }

  return payloadOPTIONS(request, context);
};

export const GET = async (request: Request, context: PayloadRouteContext) => {
  if (await isRoadmapRequest(context)) {
    return handleRoadmapGet(request as NextRequest);
  }

  return payloadGET(request, context);
};

export const POST = wrapHandler(REST_POST(payloadConfigPromise));
export const DELETE = wrapHandler(REST_DELETE(payloadConfigPromise));
export const PATCH = wrapHandler(REST_PATCH(payloadConfigPromise));
export const PUT = wrapHandler(REST_PUT(payloadConfigPromise));
