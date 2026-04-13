import { computed, ref } from 'vue';
import {
  extractEditorWriteErrorCode,
  extractEditorWriteErrorMessage,
} from '~/modules/editor/locks';
import { asStatusCode } from '~/modules/media/galleryRequestErrors';

export type EditorMutationOutboxStatus =
  | 'synced'
  | 'dirty'
  | 'saving'
  | 'locked_by_other'
  | 'conflict_detected'
  | 'save_failed';

type QueueEntry<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type UseEditorMutationOutboxOptions = {
  maxRetries?: number;
  retryDelayMs?: number;
};

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const isRetriableWriteError = (error: unknown): boolean => {
  const code = extractEditorWriteErrorCode(error);
  if (code === 'idempotency_in_progress') {
    return true;
  }

  const statusCode = asStatusCode(error);
  if (statusCode != null && RETRYABLE_STATUS_CODES.has(statusCode)) {
    return true;
  }

  const message = extractEditorWriteErrorMessage(error, '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('aborted')
  );
};

const classifyWriteFailure = (
  error: unknown,
): Exclude<EditorMutationOutboxStatus, 'synced' | 'dirty' | 'saving'> => {
  const code = extractEditorWriteErrorCode(error);
  if (code === 'revision_conflict') return 'conflict_detected';
  if (code === 'editor_locked') return 'locked_by_other';
  return 'save_failed';
};

export const useEditorMutationOutbox = (
  options: UseEditorMutationOutboxOptions = {},
) => {
  const maxRetries =
    typeof options.maxRetries === 'number' && Number.isFinite(options.maxRetries) && options.maxRetries >= 0
      ? Math.trunc(options.maxRetries)
      : 2;
  const retryDelayMs =
    typeof options.retryDelayMs === 'number' && Number.isFinite(options.retryDelayMs) && options.retryDelayMs > 0
      ? Math.trunc(options.retryDelayMs)
      : 300;

  const status = ref<EditorMutationOutboxStatus>('synced');
  const errorMessage = ref('');
  const queueLength = ref(0);
  const processing = ref(false);
  const queue: QueueEntry<unknown>[] = [];

  const runWithRetry = async <T>(execute: () => Promise<T>): Promise<T> => {
    let attempt = 0;

    while (true) {
      try {
        return await execute();
      } catch (error) {
        if (attempt >= maxRetries || !isRetriableWriteError(error)) {
          throw error;
        }
        attempt += 1;
        await sleep(retryDelayMs * attempt);
      }
    }
  };

  const processQueue = async () => {
    if (processing.value) return;
    processing.value = true;

    while (queue.length > 0) {
      const current = queue.shift();
      queueLength.value = queue.length;
      if (!current) continue;

      status.value = 'saving';
      try {
        const result = await runWithRetry(current.execute as () => Promise<unknown>);
        current.resolve(result);
        errorMessage.value = '';
        status.value = queue.length > 0 ? 'dirty' : 'synced';
      } catch (error) {
        status.value = classifyWriteFailure(error);
        errorMessage.value = extractEditorWriteErrorMessage(error, 'Unable to save changes.');
        current.reject(error);

        // Reject queued writes after a failure so callers can refresh/retry intentionally.
        while (queue.length > 0) {
          const pending = queue.shift();
          pending?.reject(error);
        }
        queueLength.value = 0;
      }
    }

    processing.value = false;
    if (queue.length === 0 && status.value === 'saving') {
      status.value = 'synced';
    }
  };

  const enqueue = <T>(execute: () => Promise<T>): Promise<T> => {
    if (status.value === 'synced') {
      status.value = 'dirty';
    }

    return new Promise<T>((resolve, reject) => {
      queue.push({
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      queueLength.value = queue.length;
      void processQueue();
    });
  };

  const markDirty = () => {
    if (status.value === 'synced') {
      status.value = 'dirty';
    }
  };

  const clearError = () => {
    errorMessage.value = '';
    if (status.value === 'save_failed' || status.value === 'conflict_detected' || status.value === 'locked_by_other') {
      status.value = queue.length > 0 ? 'dirty' : 'synced';
    }
  };

  return {
    status: computed(() => status.value),
    errorMessage: computed(() => errorMessage.value),
    queueLength: computed(() => queueLength.value),
    isSaving: computed(() => status.value === 'saving'),
    enqueue,
    markDirty,
    clearError,
  };
};
