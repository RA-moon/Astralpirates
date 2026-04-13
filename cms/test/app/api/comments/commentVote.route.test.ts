import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/store', () => ({
  applyVote: vi.fn(),
  countVisibleComments: vi.fn(),
  loadCommentWithThread: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/serializer', () => ({
  attachAuthors: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/policies', () => ({
  resolveCommentPolicy: vi.fn(),
}));

import { PUT } from '@/app/api/comments/[commentId]/vote/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import { applyVote, countVisibleComments, loadCommentWithThread } from '@/app/api/_lib/comments/store';
import { attachAuthors } from '@/app/api/_lib/comments/serializer';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedLoadCommentWithThread = vi.mocked(loadCommentWithThread);
const mockedApplyVote = vi.mocked(applyVote);
const mockedAttachAuthors = vi.mocked(attachAuthors);
const mockedCountVisibleComments = vi.mocked(countVisibleComments);
const mockedResolveCommentPolicy = vi.mocked(resolveCommentPolicy);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

describe('PUT /api/comments/:commentId/vote', () => {
  const payload = {
    logger: {
      error: vi.fn(),
    },
  };
  const thread = {
    id: 12,
    resourceType: 'flight-plan-task',
    resourceId: 7,
    createdById: 7,
    locked: false,
    pinned: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const comment = {
    id: 5,
    threadId: thread.id,
    parentCommentId: null,
    bodyRaw: 'Hello',
    bodyHtml: '<p>Hello</p>',
    createdById: 7,
    editedAt: null,
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    score: 0,
    upvotes: 0,
    downvotes: 0,
    replyCount: 0,
    lastActivityAt: null,
    viewerVote: 0,
  };
  const policy = {
    canView: true,
    canComment: true,
    canVote: true,
    canModerate: false,
    defaultSort: 'best',
    resourceLabel: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 7 },
    } as any);
    mockedLoadCommentWithThread.mockResolvedValue({ comment, thread });
    mockedResolveCommentPolicy.mockResolvedValue({
      ok: true,
      policy,
      resourceId: 7,
    } as any);
    mockedApplyVote.mockResolvedValue({ ...comment, score: 1 });
    mockedAttachAuthors.mockResolvedValue([
      {
        ...comment,
        score: 1,
        author: null,
        children: [],
      },
    ]);
    mockedCountVisibleComments.mockResolvedValue(1);
  });

  it('rejects invalid votes', async () => {
    const response = await PUT(
      makeRequest({ vote: 'up' }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(400);
  });

  it('blocks votes when thread is locked for non-moderators', async () => {
    mockedLoadCommentWithThread.mockResolvedValueOnce({
      comment,
      thread: { ...thread, locked: true },
    });
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, canModerate: false },
      resourceId: 7,
    } as any);

    const response = await PUT(
      makeRequest({ vote: 1 }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(423);
  });

  it('blocks votes when policy disallows', async () => {
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, canVote: false },
      resourceId: 7,
    } as any);

    const response = await PUT(
      makeRequest({ vote: 1 }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(403);
  });

  it('applies a vote', async () => {
    const response = await PUT(
      makeRequest({ vote: 1 }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comment).toBeTruthy();
    expect(mockedApplyVote).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 5, voterId: 7, vote: 1 }),
    );
  });
});
