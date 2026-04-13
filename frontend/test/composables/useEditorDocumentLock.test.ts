import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorDocumentLock } from '~/composables/useEditorDocumentLock';

const lockFixture = {
  documentType: 'page' as const,
  documentId: 42,
  lockMode: 'soft' as const,
  holderUserId: 7,
  holderSessionId: 'session-123',
  acquiredAt: '2026-03-30T10:00:00.000Z',
  expiresAt: '2026-03-30T10:01:30.000Z',
  lastHeartbeatAt: '2026-03-30T10:00:00.000Z',
  takeoverReason: null,
};

const {
  acquireEditorDocumentLockMock,
  heartbeatEditorDocumentLockMock,
  releaseEditorDocumentLockMock,
  takeoverEditorDocumentLockMock,
  extractEditorWriteErrorMessageMock,
} = vi.hoisted(() => ({
  acquireEditorDocumentLockMock: vi.fn(),
  heartbeatEditorDocumentLockMock: vi.fn(),
  releaseEditorDocumentLockMock: vi.fn(),
  takeoverEditorDocumentLockMock: vi.fn(),
  extractEditorWriteErrorMessageMock: vi.fn((_error: unknown, fallback: string) => fallback),
}));

vi.mock('~/modules/editor/session', () => ({
  getOrCreateEditorSessionId: () => 'session-123',
}));

vi.mock('~/modules/editor/locks', () => ({
  acquireEditorDocumentLock: acquireEditorDocumentLockMock,
  heartbeatEditorDocumentLock: heartbeatEditorDocumentLockMock,
  releaseEditorDocumentLock: releaseEditorDocumentLockMock,
  takeoverEditorDocumentLock: takeoverEditorDocumentLockMock,
  extractEditorWriteErrorMessage: extractEditorWriteErrorMessageMock,
}));

describe('useEditorDocumentLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    acquireEditorDocumentLockMock.mockReset();
    heartbeatEditorDocumentLockMock.mockReset();
    releaseEditorDocumentLockMock.mockReset();
    takeoverEditorDocumentLockMock.mockReset();
    extractEditorWriteErrorMessageMock.mockReset();
    extractEditorWriteErrorMessageMock.mockImplementation((_error: unknown, fallback: string) => fallback);

    acquireEditorDocumentLockMock.mockResolvedValue({
      status: 'acquired',
      lock: lockFixture,
      reacquired: false,
      tookExpiredLock: false,
    });
    heartbeatEditorDocumentLockMock.mockResolvedValue({
      status: 'ok',
      lock: {
        ...lockFixture,
        lastHeartbeatAt: '2026-03-30T10:00:30.000Z',
        expiresAt: '2026-03-30T10:02:00.000Z',
      },
    });
    releaseEditorDocumentLockMock.mockResolvedValue(true);
    takeoverEditorDocumentLockMock.mockResolvedValue({
      status: 'taken_over',
      lock: {
        ...lockFixture,
        holderUserId: 9,
        holderSessionId: 'session-123',
        takeoverReason: 'Previous editor session inactive.',
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires and refreshes heartbeat for the active lock', async () => {
    const lock = useEditorDocumentLock();
    await lock.start({
      documentType: 'page',
      documentId: 42,
      authToken: 'token-a',
      lockMode: 'soft',
    });

    expect(lock.status.value).toBe('held');
    expect(acquireEditorDocumentLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'page',
        documentId: 42,
        sessionId: 'session-123',
      }),
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeatEditorDocumentLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'page',
        documentId: 42,
        sessionId: 'session-123',
      }),
    );
  });

  it('surfaces locked-by-other state from acquire', async () => {
    acquireEditorDocumentLockMock.mockResolvedValueOnce({
      status: 'locked',
      lock: {
        ...lockFixture,
        holderUserId: 99,
        holderSessionId: 'session-foreign',
      },
      error: 'Document is currently locked by another editor session.',
    });

    const lock = useEditorDocumentLock();
    await lock.start({
      documentType: 'page',
      documentId: 42,
      authToken: 'token-a',
    });

    expect(lock.status.value).toBe('locked_by_other');
    expect(lock.lock.value?.holderUserId).toBe(99);
  });

  it('takes over a foreign lock when takeover succeeds', async () => {
    acquireEditorDocumentLockMock.mockResolvedValueOnce({
      status: 'locked',
      lock: {
        ...lockFixture,
        holderUserId: 99,
        holderSessionId: 'session-foreign',
      },
      error: 'Document is currently locked by another editor session.',
    });

    const lock = useEditorDocumentLock();
    await lock.start({
      documentType: 'page',
      documentId: 42,
      authToken: 'token-a',
    });

    const result = await lock.takeover('Previous editor session inactive.');

    expect(result).toBe(true);
    expect(lock.status.value).toBe('held');
    expect(takeoverEditorDocumentLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'page',
        documentId: 42,
        sessionId: 'session-123',
      }),
    );
  });

  it('releases a held lock and resets state', async () => {
    const lock = useEditorDocumentLock();
    await lock.start({
      documentType: 'page',
      documentId: 42,
      authToken: 'token-a',
    });

    await lock.release();

    expect(releaseEditorDocumentLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'page',
        documentId: 42,
        sessionId: 'session-123',
      }),
    );
    expect(lock.status.value).toBe('idle');
    expect(lock.lock.value).toBeNull();
  });
});
