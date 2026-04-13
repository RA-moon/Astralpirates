import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  attachAuthors,
} from '@/app/api/_lib/comments/serializer';
import {
  countVisibleComments,
  createComment,
  ensureParentBelongsToThread,
  loadThreadById,
} from '@/app/api/_lib/comments/store';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';
import { resolveCommentMentions } from '@/app/api/_lib/comments/mentions';
import type { CommentNode } from '@/app/api/_lib/comments/types';
import { normalizeCommentBody } from '@/app/api/_lib/comments/markdown';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';
import {
  enqueueFlightPlanTaskDigest,
  notifyFlightPlanTaskMention,
} from '@/src/services/notifications/flightPlans';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

const METHODS = 'OPTIONS,POST';

const parseBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const body = await parseBody(req);
  const threadId = normaliseId(body.threadId);
  const parentCommentId = normaliseId(body.parentCommentId);
  const commentBody = normalizeCommentBody(body.body);

  if (threadId == null || !commentBody) {
    return corsJson(req, { error: 'Comment body and thread are required.' }, { status: 400 }, METHODS);
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

  if (thread.locked && !policyResult.policy.canModerate) {
    return corsJson(
      req,
      { error: 'Thread is locked.' },
      { status: 423 },
      METHODS,
    );
  }

  if (!policyResult.policy.canComment) {
    return corsJson(
      req,
      { error: 'Comment access denied.' },
      { status: 403 },
      METHODS,
    );
  }

  if (parentCommentId != null) {
    const belongs = await ensureParentBelongsToThread(auth.payload, threadId, parentCommentId);
    if (!belongs) {
      return corsJson(req, { error: 'Invalid parent comment.' }, { status: 400 }, METHODS);
    }
  }

  try {
    const mentionResolution = await resolveCommentMentions({
      payload: auth.payload,
      thread,
      rawBody: commentBody,
      rawMentionMembershipIds: body.mentionMembershipIds,
    });

    const created = await createComment({
      payload: auth.payload,
      threadId,
      parentCommentId: parentCommentId ?? null,
      body: commentBody,
      mentionMembershipIds: mentionResolution.mentionMembershipIds,
      createdById: auth.user.id,
    });

    if (!created) {
      return corsJson(req, { error: 'Unable to create comment.' }, { status: 500 }, METHODS);
    }

    const [commentWithAuthor] = await attachAuthors(auth.payload, [created]);
    const total = await countVisibleComments(auth.payload, threadId);

    if (mentionResolution.flightPlanId != null && mentionResolution.taskId != null) {
      await publishTaskEvent({
        payload: auth.payload,
        event: createTaskEvent({
          flightPlanId: mentionResolution.flightPlanId,
          taskId: mentionResolution.taskId,
          type: 'comment-created',
          taskIsCrewOnly: mentionResolution.taskIsCrewOnly ?? undefined,
          comment: commentWithAuthor,
          version: mentionResolution.taskVersion ?? undefined,
        }),
      });
    }

    const mentionTargets = mentionResolution.mentionUserIds.filter((userId) => userId !== auth.user?.id);
    if (mentionTargets.length) {
      const notifications = mentionTargets.map((recipientId) =>
        notifyFlightPlanTaskMention({
          payload: auth.payload,
          recipientId,
          planSlug: mentionResolution.planSlug,
          planTitle: mentionResolution.planTitle,
          taskTitle: mentionResolution.taskTitle,
          actorId: auth.user?.id ?? null,
        }),
      );
      const digestEntries = mentionTargets.map((recipientId) =>
        enqueueFlightPlanTaskDigest({
          payload: auth.payload,
          recipientId,
          planSlug: mentionResolution.planSlug,
          planTitle: mentionResolution.planTitle,
          taskTitle: mentionResolution.taskTitle,
          reason: 'Mentioned in a task discussion',
        }),
      );
      await Promise.all([...notifications, ...digestEntries]);
    }

    return corsJson(
      req,
      {
        comment: commentWithAuthor as CommentNode,
        totalComments: total,
      },
      { status: 201 },
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error({ err: error, threadId }, '[comments] failed to create comment');
    return corsJson(req, { error: 'Unable to create comment.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
