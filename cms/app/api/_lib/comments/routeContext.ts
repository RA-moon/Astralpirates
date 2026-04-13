import type { NextRequest } from 'next/server';

import { authenticateRequest } from '../auth';
import { corsJson } from '../cors';
import { normaliseId } from '../flightPlanMembers';
import { resolveCommentPolicy } from './policies';
import { loadCommentWithThread } from './store';
import type { CommentRecord, CommentThreadRecord, ThreadPermissions } from './types';

type RouteResult<T> = { ok: true; value: T } | { ok: false; response: Response };

type RequestAuthContext = Awaited<ReturnType<typeof authenticateRequest>>;
type AuthenticatedRequestAuthContext = RequestAuthContext & {
  user: NonNullable<RequestAuthContext['user']>;
};

export type CommentActionRouteContext = {
  auth: AuthenticatedRequestAuthContext;
  commentId: number;
  comment: CommentRecord;
  thread: CommentThreadRecord;
  policy: ThreadPermissions;
};

export const resolveCommentActionRouteContext = async ({
  req,
  params,
  methods,
}: {
  req: NextRequest;
  params: Promise<{ commentId: string }>;
  methods: string;
}): Promise<RouteResult<CommentActionRouteContext>> => {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return {
      ok: false,
      response: corsJson(req, { error: 'Authentication required.' }, { status: 401 }, methods),
    };
  }

  const { commentId: rawCommentId } = await params;
  const commentId = normaliseId(rawCommentId);
  if (commentId == null) {
    return {
      ok: false,
      response: corsJson(req, { error: 'Invalid comment id.' }, { status: 400 }, methods),
    };
  }

  const { comment, thread } = await loadCommentWithThread(auth.payload, commentId, auth.user.id);
  if (!comment || !thread) {
    return {
      ok: false,
      response: corsJson(req, { error: 'Comment not found.' }, { status: 404 }, methods),
    };
  }

  const policyResult = await resolveCommentPolicy({
    auth,
    resourceType: thread.resourceType,
    resourceId: thread.resourceId,
    thread,
  });
  if (!policyResult.ok) {
    return {
      ok: false,
      response: corsJson(
        req,
        { error: policyResult.error },
        { status: policyResult.status },
        methods,
      ),
    };
  }

  const authenticatedAuth: AuthenticatedRequestAuthContext = {
    ...auth,
    user: auth.user,
  };

  return {
    ok: true,
    value: {
      auth: authenticatedAuth,
      commentId,
      comment,
      thread,
      policy: policyResult.policy,
    },
  };
};

export const requireUnlockedCommentThread = ({
  req,
  methods,
  thread,
  canModerate,
}: {
  req: NextRequest;
  methods: string;
  thread: CommentThreadRecord;
  canModerate: boolean;
}): Response | null => {
  if (!thread.locked || canModerate) return null;
  return corsJson(
    req,
    { error: 'Thread is locked.' },
    { status: 423 },
    methods,
  );
};
