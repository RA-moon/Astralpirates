import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import {
  acquireEditorDocumentLock,
  heartbeatEditorDocumentLock,
  releaseEditorDocumentLock,
  takeoverEditorDocumentLock,
  type EditorDocumentLock,
  type EditorDocumentType,
  type EditorLockMode,
  extractEditorWriteErrorMessage,
} from '~/modules/editor/locks';
import { getOrCreateEditorSessionId } from '~/modules/editor/session';

export type EditorLockStatus = 'idle' | 'acquiring' | 'held' | 'locked_by_other' | 'error';

type EditorLockTarget = {
  documentType: EditorDocumentType;
  documentId: number;
  authToken?: string | null;
  lockMode?: EditorLockMode;
  leaseSeconds?: number;
};

const HEARTBEAT_INTERVAL_MS = 30_000;

const isSameTarget = (a: EditorLockTarget | null, b: EditorLockTarget | null): boolean => {
  if (!a || !b) return false;
  return a.documentType === b.documentType && a.documentId === b.documentId;
};

const normaliseTarget = (target: EditorLockTarget | null): EditorLockTarget | null => {
  if (!target) return null;
  const parsedId =
    typeof target.documentId === 'number' && Number.isFinite(target.documentId)
      ? Math.trunc(target.documentId)
      : null;
  if (!parsedId || parsedId < 1) return null;
  return {
    ...target,
    documentId: parsedId,
  };
};

export const useEditorDocumentLock = () => {
  const sessionId = getOrCreateEditorSessionId();
  const status = ref<EditorLockStatus>('idle');
  const lock = ref<EditorDocumentLock | null>(null);
  const errorMessage = ref('');
  const takeoverPending = ref(false);

  const target = ref<EditorLockTarget | null>(null);
  const acquiring = ref(false);
  const heartbeatInFlight = ref(false);
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const clearHeartbeat = () => {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const setHeldLock = (nextLock: EditorDocumentLock) => {
    lock.value = nextLock;
    status.value = 'held';
    errorMessage.value = '';
  };

  const setForeignLock = (nextLock: EditorDocumentLock, message?: string) => {
    clearHeartbeat();
    lock.value = nextLock;
    status.value = 'locked_by_other';
    errorMessage.value = message?.trim() || '';
  };

  const setLockError = (message: string) => {
    clearHeartbeat();
    status.value = 'error';
    errorMessage.value = message;
  };

  const heartbeat = async () => {
    if (heartbeatInFlight.value) return;
    const activeTarget = target.value;
    if (!activeTarget || status.value !== 'held') return;

    heartbeatInFlight.value = true;
    try {
      const response = await heartbeatEditorDocumentLock({
        authToken: activeTarget.authToken,
        documentType: activeTarget.documentType,
        documentId: activeTarget.documentId,
        sessionId,
        leaseSeconds: activeTarget.leaseSeconds,
      });

      if (response.status === 'ok') {
        setHeldLock(response.lock);
        return;
      }

      if (response.status === 'missing') {
        status.value = 'idle';
        lock.value = null;
        clearHeartbeat();
        await acquire();
      }
    } catch (error: unknown) {
      setLockError(extractEditorWriteErrorMessage(error, 'Failed to refresh editor lock.'));
    } finally {
      heartbeatInFlight.value = false;
    }
  };

  const startHeartbeat = () => {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  };

  const acquire = async () => {
    if (acquiring.value) return;
    const activeTarget = target.value;
    if (!activeTarget) return;

    acquiring.value = true;
    status.value = 'acquiring';
    errorMessage.value = '';

    try {
      const response = await acquireEditorDocumentLock({
        authToken: activeTarget.authToken,
        documentType: activeTarget.documentType,
        documentId: activeTarget.documentId,
        sessionId,
        lockMode: activeTarget.lockMode,
        leaseSeconds: activeTarget.leaseSeconds,
      });

      if (response.status === 'acquired') {
        setHeldLock(response.lock);
        startHeartbeat();
        return;
      }

      setForeignLock(response.lock, response.error);
    } catch (error: unknown) {
      setLockError(extractEditorWriteErrorMessage(error, 'Failed to acquire editor lock.'));
    } finally {
      acquiring.value = false;
    }
  };

  const release = async (releaseTarget = target.value) => {
    clearHeartbeat();

    if (
      status.value === 'held' &&
      releaseTarget &&
      Number.isFinite(releaseTarget.documentId) &&
      releaseTarget.documentId > 0
    ) {
      try {
        await releaseEditorDocumentLock({
          authToken: releaseTarget.authToken,
          documentType: releaseTarget.documentType,
          documentId: releaseTarget.documentId,
          sessionId,
        });
      } catch {
        // Release failures are non-blocking on client side.
      }
    }

    if (isSameTarget(target.value, releaseTarget)) {
      target.value = null;
    }
    status.value = 'idle';
    lock.value = null;
    errorMessage.value = '';
  };

  const start = async (nextTarget: EditorLockTarget | null) => {
    const normalizedTarget = normaliseTarget(nextTarget);
    if (!normalizedTarget) {
      await release();
      return;
    }

    const currentTarget = target.value;
    if (!isSameTarget(currentTarget, normalizedTarget)) {
      await release(currentTarget);
      target.value = normalizedTarget;
      await acquire();
      return;
    }

    target.value = normalizedTarget;
    if (status.value === 'held') {
      return;
    }

    await acquire();
  };

  const takeover = async (reason: string): Promise<boolean> => {
    const activeTarget = target.value;
    const trimmedReason = reason.trim();
    if (!activeTarget || !trimmedReason) return false;

    takeoverPending.value = true;
    try {
      const response = await takeoverEditorDocumentLock({
        authToken: activeTarget.authToken,
        documentType: activeTarget.documentType,
        documentId: activeTarget.documentId,
        sessionId,
        reason: trimmedReason,
        leaseSeconds: activeTarget.leaseSeconds,
      });

      if (response.status === 'taken_over') {
        setHeldLock(response.lock);
        startHeartbeat();
        return true;
      }

      if (response.status === 'not_expired') {
        setForeignLock(response.lock, response.error);
        return false;
      }

      setLockError(response.error);
      await acquire();
      return status.value === 'held';
    } catch (error: unknown) {
      setLockError(extractEditorWriteErrorMessage(error, 'Lock takeover failed.'));
      return false;
    } finally {
      takeoverPending.value = false;
    }
  };

  const isHeld = computed(() => status.value === 'held');
  const isLockedByOther = computed(() => status.value === 'locked_by_other');

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      void release();
    });
  }

  return {
    sessionId,
    status,
    lock,
    errorMessage,
    takeoverPending,
    isHeld,
    isLockedByOther,
    start,
    acquire,
    release,
    takeover,
    setForeignLock,
  };
};
