import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  attachAuthors,
  buildThreadView,
} from '@/app/api/_lib/comments/serializer';
import {
  countVisibleComments,
  getOrCreateThread,
  listCommentsForThread,
} from '@/app/api/_lib/comments/store';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';
import type { CommentSort } from '@/app/api/_lib/comments/types';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';

const METHODS = 'OPTIONS,POST';

const parseBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const sanitizeResourceType = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseSort = (value: unknown): CommentSort | null => {
  if (typeof value !== 'string') return null;
  if (
    value === 'best'
    || value === 'top'
    || value === 'new'
    || value === 'old'
    || value === 'controversial'
  ) {
    return value;
  }
  return null;
};

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const body = await parseBody(req);
  const resourceType = sanitizeResourceType(body.resourceType);
  const resourceId = normaliseId(body.resourceId);
  const requestedSort = parseSort(body.sort);

  if (!resourceType || resourceId == null) {
    return corsJson(req, { error: 'Invalid comment resource.' }, { status: 400 }, METHODS);
  }

  const policyResult = await resolveCommentPolicy({
    auth,
    resourceType,
    resourceId,
  });

  if (!policyResult.ok) {
    return corsJson(
      req,
      { error: policyResult.error },
      { status: policyResult.status },
      METHODS,
    );
  }

  try {
    const thread = await getOrCreateThread(
      auth.payload,
      resourceType,
      policyResult.resourceId,
      auth.user?.id ?? null,
    );
    if (!thread) {
      return corsJson(req, { error: 'Failed to prepare thread.' }, { status: 500 }, METHODS);
    }

    const sort = requestedSort ?? policyResult.policy.defaultSort;
    const comments = await listCommentsForThread({
      payload: auth.payload,
      threadId: thread.id,
      sort,
      viewerId: auth.user?.id ?? null,
    });
    const total = await countVisibleComments(auth.payload, thread.id);
    const commentsWithAuthors = await attachAuthors(auth.payload, comments);

    return corsJson(
      req,
      {
        thread: buildThreadView({
          thread,
          comments: commentsWithAuthors,
          totalComments: total,
          policy: policyResult.policy,
        }),
      },
      { status: 200 },
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error(
      { err: error, resourceType, resourceId },
      '[comments] failed to upsert thread',
    );
    return corsJson(req, { error: 'Unable to load comments.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
