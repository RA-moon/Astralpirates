import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/store', () => ({
  countVisibleComments: vi.fn(),
  loadCommentWithThread: vi.fn(),
  markCommentDeleted: vi.fn(),
  updateCommentBody: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/serializer', () => ({
  attachAuthors: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/policies', () => ({
  resolveCommentPolicy: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanTaskEvents', () => ({
  createTaskEvent: vi.fn((payload) => ({ eventId: 'evt-1', happenedAt: '2025-01-01T00:00:00.000Z', ...payload })),
  publishTaskEvent: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanTasks', () => ({
  loadTaskById: vi.fn(),
}));

import { PATCH } from '@/app/api/comments/[commentId]/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  countVisibleComments,
  loadCommentWithThread,
  markCommentDeleted,
  updateCommentBody,
} from '@/app/api/_lib/comments/store';
import { attachAuthors } from '@/app/api/_lib/comments/serializer';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';
import { loadTaskById } from '@/app/api/_lib/flightPlanTasks';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedLoadCommentWithThread = vi.mocked(loadCommentWithThread);
const mockedMarkCommentDeleted = vi.mocked(markCommentDeleted);
const mockedUpdateCommentBody = vi.mocked(updateCommentBody);
const mockedAttachAuthors = vi.mocked(attachAuthors);
const mockedCountVisibleComments = vi.mocked(countVisibleComments);
const mockedResolveCommentPolicy = vi.mocked(resolveCommentPolicy);
const mockedCreateTaskEvent = vi.mocked(createTaskEvent);
const mockedPublishTaskEvent = vi.mocked(publishTaskEvent);
const mockedLoadTaskById = vi.mocked(loadTaskById);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

describe('PATCH /api/comments/:commentId', () => {
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
  const baseComment = {
    id: 5,
    threadId: thread.id,
    parentCommentId: null,
    bodyRaw: 'Hello',
    bodyHtml: '<p>Hello</p>',
    mentionMembershipIds: [],
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
    mockedLoadCommentWithThread.mockResolvedValue({
      comment: baseComment,
      thread,
    });
    mockedResolveCommentPolicy.mockResolvedValue({
      ok: true,
      policy,
      resourceId: 7,
    } as any);
    mockedMarkCommentDeleted.mockResolvedValue({ ...baseComment, deletedAt: '2025-01-02T00:00:00.000Z' });
    mockedUpdateCommentBody.mockResolvedValue({ ...baseComment, bodyRaw: 'Updated', bodyHtml: '<p>Updated</p>' });
    mockedAttachAuthors.mockResolvedValue([
      {
        ...baseComment,
        author: null,
        mentions: [],
        children: [],
      },
    ]);
    mockedCountVisibleComments.mockResolvedValue(1);
    mockedLoadTaskById.mockResolvedValue({
      id: 7,
      flightPlanId: 99,
      version: 2,
      isCrewOnly: true,
    } as any);
  });

  it('requires authentication', async () => {
    mockedAuthenticateRequest.mockResolvedValueOnce({ payload, user: null } as any);

    const response = await PATCH(
      makeRequest({ action: 'delete' }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 423 when thread is locked for non-moderators', async () => {
    mockedLoadCommentWithThread.mockResolvedValueOnce({
      comment: baseComment,
      thread: { ...thread, locked: true },
    });
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, canModerate: false },
      resourceId: 7,
    } as any);

    const response = await PATCH(
      makeRequest({ body: 'Updated' }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(423);
  });

  it('deletes a comment when author requests', async () => {
    const response = await PATCH(
      makeRequest({ action: 'delete' }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(200);
    expect(mockedMarkCommentDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 5, deleted: true }),
    );
    expect(mockedCreateTaskEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 7,
        taskIsCrewOnly: true,
        type: 'comment-deleted',
      }),
    );
    expect(mockedPublishTaskEvent).toHaveBeenCalledTimes(1);
  });

  it('restores a comment for moderators', async () => {
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, canModerate: true },
      resourceId: 7,
    } as any);
    mockedLoadCommentWithThread.mockResolvedValueOnce({
      comment: { ...baseComment, deletedAt: '2025-01-02T00:00:00.000Z' },
      thread,
    });

    const response = await PATCH(
      makeRequest({ action: 'restore' }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(200);
    expect(mockedMarkCommentDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 5, deleted: false }),
    );
  });

  it('prevents edits outside the window for non-moderators', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-02T00:20:00.000Z'));

    const response = await PATCH(
      makeRequest({ body: 'Updated' }),
      { params: Promise.resolve({ commentId: '5' }) },
    );
    expect(response.status).toBe(403);
    expect(mockedUpdateCommentBody).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
