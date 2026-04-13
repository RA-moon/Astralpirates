import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/store', () => ({
  countVisibleComments: vi.fn(),
  createComment: vi.fn(),
  ensureParentBelongsToThread: vi.fn(),
  loadThreadById: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/serializer', () => ({
  attachAuthors: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/policies', () => ({
  resolveCommentPolicy: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/mentions', () => ({
  resolveCommentMentions: vi.fn(),
}));

vi.mock('@/src/services/notifications/flightPlans', () => ({
  notifyFlightPlanTaskMention: vi.fn(),
  enqueueFlightPlanTaskDigest: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanTaskEvents', () => ({
  createTaskEvent: vi.fn((payload) => ({ eventId: 'evt-1', happenedAt: '2025-01-01T00:00:00.000Z', ...payload })),
  publishTaskEvent: vi.fn(),
}));

import { POST } from '@/app/api/comments/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  countVisibleComments,
  createComment,
  ensureParentBelongsToThread,
  loadThreadById,
} from '@/app/api/_lib/comments/store';
import { attachAuthors } from '@/app/api/_lib/comments/serializer';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';
import { resolveCommentMentions } from '@/app/api/_lib/comments/mentions';
import {
  notifyFlightPlanTaskMention,
  enqueueFlightPlanTaskDigest,
} from '@/src/services/notifications/flightPlans';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedLoadThreadById = vi.mocked(loadThreadById);
const mockedEnsureParent = vi.mocked(ensureParentBelongsToThread);
const mockedCreateComment = vi.mocked(createComment);
const mockedAttachAuthors = vi.mocked(attachAuthors);
const mockedCountVisibleComments = vi.mocked(countVisibleComments);
const mockedResolveCommentPolicy = vi.mocked(resolveCommentPolicy);
const mockedResolveCommentMentions = vi.mocked(resolveCommentMentions);
const mockedNotifyMention = vi.mocked(notifyFlightPlanTaskMention);
const mockedEnqueueDigest = vi.mocked(enqueueFlightPlanTaskDigest);
const mockedCreateTaskEvent = vi.mocked(createTaskEvent);
const mockedPublishTaskEvent = vi.mocked(publishTaskEvent);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

describe('POST /api/comments', () => {
  const payload = {
    logger: {
      error: vi.fn(),
    },
  };
  const thread = {
    id: 99,
    resourceType: 'flight-plan-task',
    resourceId: 200,
    createdById: 7,
    locked: false,
    pinned: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
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
    mockedLoadThreadById.mockResolvedValue(thread);
    mockedResolveCommentPolicy.mockResolvedValue({
      ok: true,
      policy,
      resourceId: 200,
    } as any);
    mockedEnsureParent.mockResolvedValue(true);
    mockedCreateComment.mockResolvedValue({
      id: 1,
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
    });
    mockedAttachAuthors.mockResolvedValue([
      {
        id: 1,
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
        author: null,
        mentions: [],
        children: [],
      },
    ]);
    mockedCountVisibleComments.mockResolvedValue(1);
    mockedResolveCommentMentions.mockResolvedValue({
      mentionMembershipIds: [],
      mentionUserIds: [],
      taskId: null,
      taskVersion: null,
      taskIsCrewOnly: null,
      taskTitle: null,
      flightPlanId: null,
      planSlug: null,
      planTitle: null,
    });
    mockedNotifyMention.mockResolvedValue(undefined as any);
    mockedEnqueueDigest.mockResolvedValue(undefined as any);
  });

  it('requires authentication', async () => {
    mockedAuthenticateRequest.mockResolvedValueOnce({
      payload,
      user: null,
    } as any);

    const response = await POST(
      makeRequest({ threadId: thread.id, body: 'Hello' }),
    );
    expect(response.status).toBe(401);
  });

  it('blocks comments when thread is locked for non-moderators', async () => {
    mockedLoadThreadById.mockResolvedValueOnce({ ...thread, locked: true });
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, canModerate: false },
      resourceId: 200,
    } as any);

    const response = await POST(
      makeRequest({ threadId: thread.id, body: 'Hello' }),
    );
    expect(response.status).toBe(423);
  });

  it('blocks comments when policy disallows', async () => {
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, canComment: false },
      resourceId: 200,
    } as any);

    const response = await POST(
      makeRequest({ threadId: thread.id, body: 'Hello' }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects invalid parent comments', async () => {
    mockedEnsureParent.mockResolvedValueOnce(false);

    const response = await POST(
      makeRequest({ threadId: thread.id, parentCommentId: 123, body: 'Hello' }),
    );
    expect(response.status).toBe(400);
  });

  it('creates a comment', async () => {
    const response = await POST(
      makeRequest({ threadId: thread.id, body: 'Hello' }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.comment).toBeTruthy();
    expect(body.totalComments).toBe(1);
    expect(mockedCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread.id,
        body: 'Hello',
        mentionMembershipIds: [],
        createdById: 7,
      }),
    );
  });

  it('dispatches mention and digest notifications for resolved mentions', async () => {
    mockedResolveCommentMentions.mockResolvedValueOnce({
      mentionMembershipIds: [111],
      mentionUserIds: [8],
      taskId: 77,
      taskVersion: 3,
      taskIsCrewOnly: true,
      taskTitle: 'Task',
      flightPlanId: 200,
      planSlug: 'test-mission',
      planTitle: 'Test Mission',
    });

    const response = await POST(
      makeRequest({ threadId: thread.id, body: 'Hello @crew', mentionMembershipIds: [111] }),
    );
    expect(response.status).toBe(201);
    expect(mockedCreateTaskEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 77,
        taskIsCrewOnly: true,
        type: 'comment-created',
      }),
    );
    expect(mockedPublishTaskEvent).toHaveBeenCalledTimes(1);
    expect(mockedNotifyMention).toHaveBeenCalledTimes(1);
    expect(mockedEnqueueDigest).toHaveBeenCalledTimes(1);
  });
});
