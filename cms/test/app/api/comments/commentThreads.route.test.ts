import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/store', () => ({
  getOrCreateThread: vi.fn(),
  listCommentsForThread: vi.fn(),
  countVisibleComments: vi.fn(),
  loadThreadById: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/serializer', () => ({
  attachAuthors: vi.fn(),
  buildThreadView: vi.fn(),
}));

vi.mock('@/app/api/_lib/comments/policies', () => ({
  resolveCommentPolicy: vi.fn(),
}));

import { POST } from '@/app/api/comment-threads/route';
import { GET as GET_THREAD } from '@/app/api/comment-threads/[threadId]/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  getOrCreateThread,
  listCommentsForThread,
  countVisibleComments,
  loadThreadById,
} from '@/app/api/_lib/comments/store';
import { attachAuthors, buildThreadView } from '@/app/api/_lib/comments/serializer';
import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedGetOrCreateThread = vi.mocked(getOrCreateThread);
const mockedListCommentsForThread = vi.mocked(listCommentsForThread);
const mockedCountVisibleComments = vi.mocked(countVisibleComments);
const mockedLoadThreadById = vi.mocked(loadThreadById);
const mockedAttachAuthors = vi.mocked(attachAuthors);
const mockedBuildThreadView = vi.mocked(buildThreadView);
const mockedResolveCommentPolicy = vi.mocked(resolveCommentPolicy);

const makePostRequest = (body: Record<string, unknown>) =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

const makeGetRequest = (query: Record<string, string | undefined> = {}) => {
  const url = new URL('https://astral.test/api/comment-threads/1');
  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string') {
      url.searchParams.set(key, value);
    }
  });
  return {
    headers: new Headers(),
    nextUrl: url,
  } as unknown as NextRequest;
};

describe('comment thread routes', () => {
  const payload = {
    logger: {
      error: vi.fn(),
    },
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
      user: { id: 55 },
    } as any);
    mockedResolveCommentPolicy.mockResolvedValue({
      ok: true,
      policy,
      resourceId: 99,
    } as any);
    mockedGetOrCreateThread.mockResolvedValue({
      id: 1,
      resourceType: 'flight-plan-task',
      resourceId: 99,
      createdById: 55,
      locked: false,
      pinned: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    mockedLoadThreadById.mockResolvedValue({
      id: 1,
      resourceType: 'flight-plan-task',
      resourceId: 99,
      createdById: 55,
      locked: false,
      pinned: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    mockedListCommentsForThread.mockResolvedValue([]);
    mockedCountVisibleComments.mockResolvedValue(0);
    mockedAttachAuthors.mockResolvedValue([]);
    mockedBuildThreadView.mockReturnValue({
      id: 1,
      resourceType: 'flight-plan-task',
      resourceId: 99,
      createdById: 55,
      locked: false,
      pinned: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      totalComments: 0,
      comments: [],
      viewer: {
        canComment: true,
        canVote: true,
        canModerate: false,
      },
    } as any);
  });

  it('creates a thread and honors requested sort', async () => {
    const response = await POST(
      makePostRequest({
        resourceType: 'flight-plan-task',
        resourceId: 99,
        sort: 'controversial',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.thread).toBeTruthy();
    expect(mockedListCommentsForThread).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'controversial' }),
    );
  });

  it('falls back to policy default sort when none provided', async () => {
    mockedResolveCommentPolicy.mockResolvedValueOnce({
      ok: true,
      policy: { ...policy, defaultSort: 'top' },
      resourceId: 99,
    } as any);

    const response = await POST(
      makePostRequest({
        resourceType: 'flight-plan-task',
        resourceId: 99,
      }),
    );
    expect(response.status).toBe(200);
    expect(mockedListCommentsForThread).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'top' }),
    );
  });

  it('returns 400 for invalid resource payload', async () => {
    const response = await POST(makePostRequest({ resourceType: '', resourceId: null }));
    expect(response.status).toBe(400);
  });

  it('loads a thread by id with sort param', async () => {
    const response = await GET_THREAD(
      makeGetRequest({ sort: 'controversial' }),
      { params: Promise.resolve({ threadId: '1' }) },
    );
    expect(response.status).toBe(200);
    expect(mockedListCommentsForThread).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'controversial' }),
    );
  });

  it('returns 404 when thread is missing', async () => {
    mockedLoadThreadById.mockResolvedValueOnce(null);
    const response = await GET_THREAD(
      makeGetRequest(),
      { params: Promise.resolve({ threadId: '404' }) },
    );
    expect(response.status).toBe(404);
  });
});
