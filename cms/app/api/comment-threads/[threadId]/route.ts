import { sql } from '@payloadcms/db-postgres';
import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  attachAuthors,
  buildThreadView,
} from '@/app/api/_lib/comments/serializer';
import {
  countVisibleComments,
  listCommentsForThread,
  loadThreadById,
} from '@/app/api/_lib/comments/store';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';
import type { CommentSort } from '@/app/api/_lib/comments/types';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';

const METHODS = 'OPTIONS,GET,PATCH';

type RouteParams = { params: Promise<{ threadId: string }> };

const parseSort = (value: string | null): CommentSort => {
  if (
    value === 'new'
    || value === 'old'
    || value === 'top'
    || value === 'best'
    || value === 'controversial'
  ) {
    return value;
  }
  return 'best';
};

const parseBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export async function GET(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { threadId: rawThreadId } = await context.params;
  const threadId = normaliseId(rawThreadId);
  if (threadId == null) {
    return corsJson(req, { error: 'Invalid thread id.' }, { status: 400 }, METHODS);
  }

  const thread = await loadThreadById(auth.payload, threadId);
  if (!thread) {
    return corsJson(req, { error: 'Thread not found.' }, { status: 404 }, METHODS);
  }

  const policyResult = await resolveCommentPolicy({
    auth,
    resourceType: thread.resourceType,
    resourceId: thread.resourceId,
    thread,
  });

  if (!policyResult.ok) {
    return corsJson(
      req,
      { error: policyResult.error },
      { status: policyResult.status },
      METHODS,
    );
  }

  const sortParam = parseSort(req.nextUrl.searchParams.get('sort'));

  try {
    const comments = await listCommentsForThread({
      payload: auth.payload,
      threadId,
      sort: sortParam,
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
      {},
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error({ err: error, threadId }, '[comments] failed to load thread');
    return corsJson(req, { error: 'Unable to load thread.' }, { status: 500 }, METHODS);
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { threadId: rawThreadId } = await context.params;
  const threadId = normaliseId(rawThreadId);
  if (threadId == null) {
    return corsJson(req, { error: 'Invalid thread id.' }, { status: 400 }, METHODS);
  }
  const thread = await loadThreadById(auth.payload, threadId);
  if (!thread) {
    return corsJson(req, { error: 'Thread not found.' }, { status: 404 }, METHODS);
  }

  const policyResult = await resolveCommentPolicy({
    auth,
    resourceType: thread.resourceType,
    resourceId: thread.resourceId,
    thread,
  });
  if (!policyResult.ok) {
    return corsJson(
      req,
      { error: policyResult.error },
      { status: policyResult.status },
      METHODS,
    );
  }
  if (!policyResult.policy.canModerate) {
    return corsJson(
      req,
      { error: 'Moderator access required.' },
      { status: auth.user ? 403 : 401 },
      METHODS,
    );
  }

  const body = await parseBody(req);
  const updates: Partial<{ locked: boolean; pinned: boolean }> = {};
  if (typeof body.locked === 'boolean') updates.locked = body.locked;
  if (typeof body.pinned === 'boolean') updates.pinned = body.pinned;

  if (Object.keys(updates).length === 0) {
    return corsJson(req, { error: 'No updates provided.' }, { status: 400 }, METHODS);
  }

  try {
    await auth.payload.db.drizzle.execute(sql`
      UPDATE "public"."comment_threads"
      SET
        locked = COALESCE(${updates.locked ?? null}, locked),
        pinned = COALESCE(${updates.pinned ?? null}, pinned),
        updated_at = NOW()
      WHERE id = ${threadId};
    `);

    const refreshed = await loadThreadById(auth.payload, threadId);
    if (!refreshed) {
      return corsJson(req, { error: 'Thread not found.' }, { status: 404 }, METHODS);
    }

    const comments = await listCommentsForThread({
      payload: auth.payload,
      threadId,
      sort: policyResult.policy.defaultSort,
      viewerId: auth.user?.id ?? null,
    });
    const total = await countVisibleComments(auth.payload, threadId);
    const commentsWithAuthors = await attachAuthors(auth.payload, comments);

    return corsJson(
      req,
      {
        thread: buildThreadView({
          thread: refreshed,
          comments: commentsWithAuthors,
          totalComments: total,
          policy: policyResult.policy,
        }),
      },
      {},
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error({ err: error, threadId }, '[comments] failed to update thread');
    return corsJson(req, { error: 'Unable to update thread.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
