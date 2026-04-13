import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  attachAuthors,
} from '@/app/api/_lib/comments/serializer';
import {
  requireUnlockedCommentThread,
  resolveCommentActionRouteContext,
} from '@/app/api/_lib/comments/routeContext';
import {
  applyVote,
  countVisibleComments,
} from '@/app/api/_lib/comments/store';

const METHODS = 'OPTIONS,PUT';

type RouteParams = { params: Promise<{ commentId: string }> };

const parseVote = (value: unknown): -1 | 0 | 1 | null => {
  const numeric = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (numeric === 1 || numeric === -1) return numeric;
  if (numeric === 0 || numeric === null) return 0;
  return null;
};

const parseBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export async function PUT(
  req: NextRequest,
  context: RouteParams,
) {
  const resolvedContext = await resolveCommentActionRouteContext({
    req,
    params: context.params,
    methods: METHODS,
  });
  if (!resolvedContext.ok) {
    return resolvedContext.response;
  }
  const { auth, commentId, comment, thread, policy } = resolvedContext.value;

  const body = await parseBody(req);
  const vote = parseVote(body.vote);
  if (vote === null) {
    return corsJson(req, { error: 'Invalid vote.' }, { status: 400 }, METHODS);
  }

  const lockedResponse = requireUnlockedCommentThread({
    req,
    methods: METHODS,
    thread,
    canModerate: policy.canModerate,
  });
  if (lockedResponse) {
    return lockedResponse;
  }

  if (!policy.canVote) {
    return corsJson(req, { error: 'Voting not permitted.' }, { status: 403 }, METHODS);
  }

  try {
    const updated = await applyVote({
      payload: auth.payload,
      commentId,
      voterId: auth.user.id,
      vote,
    });

    if (!updated) {
      return corsJson(req, { error: 'Unable to update vote.' }, { status: 500 }, METHODS);
    }

    const [commentWithAuthor] = await attachAuthors(auth.payload, [updated]);
    const total = await countVisibleComments(auth.payload, comment.threadId);

    return corsJson(
      req,
      { comment: commentWithAuthor, totalComments: total },
      {},
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error({ err: error, commentId }, '[comments] failed to apply vote');
    return corsJson(req, { error: 'Unable to update vote.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
