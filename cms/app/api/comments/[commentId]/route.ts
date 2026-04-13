import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  attachAuthors,
} from '@/app/api/_lib/comments/serializer';
import {
  type CommentActionRouteContext,
  requireUnlockedCommentThread,
  resolveCommentActionRouteContext,
} from '@/app/api/_lib/comments/routeContext';
import {
  countVisibleComments,
  markCommentDeleted,
  updateCommentBody,
} from '@/app/api/_lib/comments/store';
import { normalizeCommentBody } from '@/app/api/_lib/comments/markdown';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';
import { loadTaskById } from '@/app/api/_lib/flightPlanTasks';

const METHODS = 'OPTIONS,PATCH';
const EDIT_WINDOW_MS = 15 * 60 * 1000;

type RouteParams = { params: Promise<{ commentId: string }> };

const parseBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const withinEditWindow = (createdAt: string): boolean => {
  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= EDIT_WINDOW_MS;
};

const publishTaskCommentEvent = async ({
  payload,
  thread,
  type,
  comment,
}: {
  payload: CommentActionRouteContext['auth']['payload'];
  thread: { resourceType: string; resourceId: number };
  type: 'comment-updated' | 'comment-deleted';
  comment: unknown;
}) => {
  if (thread.resourceType !== 'flight-plan-task') return;
  const task = await loadTaskById(payload, thread.resourceId);
  if (!task) return;
  await publishTaskEvent({
    payload,
    event: createTaskEvent({
      flightPlanId: task.flightPlanId,
      taskId: task.id,
      type,
      taskIsCrewOnly: task.isCrewOnly,
      comment,
      version: task.version,
    }),
  });
};

export async function PATCH(
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
  const action = typeof body.action === 'string' ? body.action : null;
  const updatedBody = normalizeCommentBody(body.body);
  const isAuthor = auth.user.id === comment.createdById;
  const isModerator = policy.canModerate;

  const lockedResponse = requireUnlockedCommentThread({
    req,
    methods: METHODS,
    thread,
    canModerate: isModerator,
  });
  if (lockedResponse) {
    return lockedResponse;
  }

  if (action === 'delete') {
    if (!isAuthor && !isModerator) {
      return corsJson(req, { error: 'Delete access denied.' }, { status: 403 }, METHODS);
    }
    if (comment.deletedAt) {
      const [commentWithAuthor] = await attachAuthors(auth.payload, [comment]);
      const total = await countVisibleComments(auth.payload, comment.threadId);
      return corsJson(req, { comment: commentWithAuthor, totalComments: total }, {}, METHODS);
    }
    const updated = await markCommentDeleted({
      payload: auth.payload,
      commentId,
      deleted: true,
    });
    const [commentWithAuthor] = await attachAuthors(auth.payload, [updated ?? comment]);
    const total = await countVisibleComments(auth.payload, comment.threadId);
    await publishTaskCommentEvent({
      payload: auth.payload,
      thread,
      type: 'comment-deleted',
      comment: commentWithAuthor,
    });
    return corsJson(
      req,
      { comment: commentWithAuthor, totalComments: total },
      {},
      METHODS,
    );
  }

  if (action === 'restore') {
    if (!isModerator) {
      return corsJson(req, { error: 'Restore access denied.' }, { status: 403 }, METHODS);
    }
    const updated = await markCommentDeleted({
      payload: auth.payload,
      commentId,
      deleted: false,
    });
    const [commentWithAuthor] = await attachAuthors(auth.payload, [updated ?? comment]);
    const total = await countVisibleComments(auth.payload, comment.threadId);
    await publishTaskCommentEvent({
      payload: auth.payload,
      thread,
      type: 'comment-updated',
      comment: commentWithAuthor,
    });
    return corsJson(
      req,
      { comment: commentWithAuthor, totalComments: total },
      {},
      METHODS,
    );
  }

  if (updatedBody) {
    if (!isModerator && !isAuthor) {
      return corsJson(req, { error: 'Edit access denied.' }, { status: 403 }, METHODS);
    }
    if (!isModerator && !withinEditWindow(comment.createdAt)) {
      return corsJson(
        req,
        { error: 'Edit window has expired.' },
        { status: 403 },
        METHODS,
      );
    }
    if (comment.deletedAt) {
      return corsJson(req, { error: 'Cannot edit a deleted comment.' }, { status: 400 }, METHODS);
    }
    const updated = await updateCommentBody({
      payload: auth.payload,
      commentId,
      body: updatedBody,
    });
    const [commentWithAuthor] = await attachAuthors(auth.payload, [updated ?? comment]);
    const total = await countVisibleComments(auth.payload, comment.threadId);
    await publishTaskCommentEvent({
      payload: auth.payload,
      thread,
      type: 'comment-updated',
      comment: commentWithAuthor,
    });
    return corsJson(
      req,
      { comment: commentWithAuthor, totalComments: total },
      {},
      METHODS,
    );
  }

  return corsJson(req, { error: 'No changes provided.' }, { status: 400 }, METHODS);
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
