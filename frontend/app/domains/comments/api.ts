import type { $Fetch } from 'ofetch';

import { getRequestFetch } from '~/modules/api';
import type { CommentNode, CommentSort, CommentThread, CommentThreadResponse } from '~/modules/api/schemas';

const resolveAuthHeader = (rawAuthValue: string | null | undefined) => {
  if (typeof rawAuthValue !== 'string') return null;
  const trimmed = rawAuthValue.trim();
  if (!trimmed.length) return null;
  return `Bearer ${trimmed}`;
};

const withFetch = (rawAuthValue: string | null | undefined): $Fetch => {
  const fetcher = getRequestFetch();
  return ((request, options = {}) => {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    const authHeader = resolveAuthHeader(rawAuthValue);
    if (authHeader) {
      headers.set('Authorization', authHeader);
    }
    return fetcher(request, {
      ...options,
      headers,
    });
  }) as $Fetch;
};

export type CommentResponse = {
  comment: CommentNode;
  totalComments: number;
};

export const ensureCommentThread = async ({
  auth: rawAuthValue,
  resourceType,
  resourceId,
  sort,
}: {
  auth: string | null | undefined;
  resourceType: string;
  resourceId: number;
  sort?: CommentSort;
}): Promise<CommentThread> => {
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<CommentThreadResponse>('/api/comment-threads', {
    method: 'POST',
    body: { resourceType, resourceId, sort },
  });
  if (!response?.thread) {
    throw new Error('Unable to load comment thread.');
  }
  return response.thread;
};

export const fetchCommentThread = async ({
  auth: rawAuthValue,
  threadId,
  sort,
}: {
  auth: string | null | undefined;
  threadId: number;
  sort?: CommentSort;
}): Promise<CommentThread> => {
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<CommentThreadResponse>(`/api/comment-threads/${threadId}`, {
    method: 'GET',
    params: sort ? { sort } : undefined,
  });
  if (!response?.thread) {
    throw new Error('Unable to load comment thread.');
  }
  return response.thread;
};

export const createComment = async ({
  auth: rawAuthValue,
  threadId,
  parentCommentId,
  body,
}: {
  auth: string | null | undefined;
  threadId: number;
  parentCommentId?: number | null;
  body: string;
}): Promise<CommentResponse> => {
  const fetcher = withFetch(rawAuthValue);
  return fetcher<CommentResponse>('/api/comments', {
    method: 'POST',
    body: {
      threadId,
      parentCommentId,
      body,
    },
  });
};

export const updateComment = async ({
  auth: rawAuthValue,
  commentId,
  body,
  action,
}: {
  auth: string | null | undefined;
  commentId: number;
  body?: string;
  action?: 'delete' | 'restore';
}): Promise<CommentResponse> => {
  const fetcher = withFetch(rawAuthValue);
  return fetcher<CommentResponse>(`/api/comments/${commentId}`, {
    method: 'PATCH',
    body: {
      body,
      action,
    },
  });
};

export const voteOnComment = async ({
  auth: rawAuthValue,
  commentId,
  vote,
}: {
  auth: string | null | undefined;
  commentId: number;
  vote: -1 | 0 | 1;
}): Promise<CommentResponse> => {
  const fetcher = withFetch(rawAuthValue);
  return fetcher<CommentResponse>(`/api/comments/${commentId}/vote`, {
    method: 'PUT',
    body: { vote },
  });
};
