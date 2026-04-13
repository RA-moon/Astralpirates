import type { NextRequest } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';
import { corsEmpty, corsJson } from '../../_lib/cors';
import { getNeo4jDriver, isNeo4jSyncDisabled } from '@/src/utils/neo4j';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET';
const ACCESS_CLASS = 'public-scoped';
const MAX_SLUG_LENGTH = 80;

type GraphNode = {
  id: string;
  profileSlug: string | null;
  callSign: string | null;
};

type GraphEdge = {
  source: string;
  target: string;
};

type PayloadInstance = Awaited<ReturnType<typeof getPayloadInstance>>;

const normaliseSlug = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_SLUG_LENGTH) return null;
  return trimmed;
};

const fetchUserNodeBySlug = async (
  payload: PayloadInstance,
  profileSlug: string,
): Promise<GraphNode | null> => {
  const result = await payload.find({
    collection: 'users',
    limit: 1,
    page: 1,
    depth: 0,
    select: {
      id: true,
      profileSlug: true,
      callSign: true,
    },
    overrideAccess: true,
    where: {
      profileSlug: {
        equals: profileSlug,
      },
    },
  });

  const [doc] = result.docs;
  if (!doc) return null;
  return {
    id: String(doc.id),
    profileSlug: doc.profileSlug ?? null,
    callSign: doc.callSign ?? null,
  };
};

const fetchUserNodeById = async (
  payload: PayloadInstance,
  id: string,
): Promise<GraphNode | null> => {
  try {
    const doc = await payload.findByID({
      collection: 'users',
      id,
      depth: 0,
      select: {
        id: true,
        profileSlug: true,
        callSign: true,
      },
      overrideAccess: true,
    });
    if (!doc) return null;
    return {
      id: String(doc.id),
      profileSlug: doc.profileSlug ?? null,
      callSign: doc.callSign ?? null,
    };
  } catch (error) {
    console.warn('[neo4j] failed to resolve inviter profile', error);
    return null;
  }
};

const fetchInviterId = async (targetUserId: string): Promise<string | null> => {
  if (isNeo4jSyncDisabled()) return null;

  try {
    const driver = getNeo4jDriver();
    const result = await driver.executeQuery(
      `
      MATCH (inviter:User)-[:HIRED]->(invitee:User)
      WHERE invitee.payloadId = $target
      RETURN inviter.payloadId AS source
      LIMIT 1
    `,
      {
        target: targetUserId,
      },
    );
    const source = result.records[0]?.get('source') as string | number | null | undefined;
    if (source == null) return null;
    return String(source);
  } catch (error) {
    console.warn('[neo4j] failed to fetch invite graph', error);
    return null;
  }
};

export async function GET(req: NextRequest) {
  const slug = normaliseSlug(req.nextUrl.searchParams.get('slug'));
  if (!slug) {
    const response = corsJson(req, { error: 'Profile slug is required.', nodes: [], edges: [] }, { status: 400 }, METHODS);
    response.headers.set('X-API-Access-Class', ACCESS_CLASS);
    return response;
  }

  const payload = await getPayloadInstance();
  const targetNode = await fetchUserNodeBySlug(payload, slug);
  if (!targetNode) {
    const response = corsJson(req, { nodes: [], edges: [] }, {}, METHODS);
    response.headers.set('X-API-Access-Class', ACCESS_CLASS);
    return response;
  }

  const inviterId = await fetchInviterId(targetNode.id);
  if (!inviterId) {
    const response = corsJson(req, { nodes: [targetNode], edges: [] }, {}, METHODS);
    response.headers.set('X-API-Access-Class', ACCESS_CLASS);
    return response;
  }

  const inviterNode = await fetchUserNodeById(payload, inviterId);
  const nodes = inviterNode ? [targetNode, inviterNode] : [targetNode];
  const edges: GraphEdge[] = inviterNode
    ? [
        {
          source: inviterNode.id,
          target: targetNode.id,
        },
      ]
    : [];
  const response = corsJson(req, { nodes, edges }, {}, METHODS);
  response.headers.set('X-API-Access-Class', ACCESS_CLASS);
  return response;
}

export async function OPTIONS(req: NextRequest) {
  const response = corsEmpty(req, METHODS);
  response.headers.set('X-API-Access-Class', ACCESS_CLASS);
  return response;
}
