import { describe, expect, it, vi } from 'vitest';

import { useEditorMutationOutbox } from '~/composables/useEditorMutationOutbox';

describe('useEditorMutationOutbox', () => {
  it('serializes queued writes and returns synced state', async () => {
    const outbox = useEditorMutationOutbox({ maxRetries: 0 });
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = outbox.enqueue(async () => {
      order.push('first:start');
      await firstDone;
      order.push('first:end');
      return 'first';
    });
    const second = outbox.enqueue(async () => {
      order.push('second');
      return 'second';
    });

    await Promise.resolve();
    expect(order).toEqual(['first:start']);

    releaseFirst?.();

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(order).toEqual(['first:start', 'first:end', 'second']);
    expect(outbox.status.value).toBe('synced');
    expect(outbox.queueLength.value).toBe(0);
  });

  it('enters conflict state for revision conflicts', async () => {
    const outbox = useEditorMutationOutbox({ maxRetries: 0 });
    const conflictError = {
      statusCode: 409,
      data: {
        code: 'revision_conflict',
        error: 'Revision conflict.',
      },
    };

    await expect(
      outbox.enqueue(async () => {
        throw conflictError;
      }),
    ).rejects.toBe(conflictError);

    expect(outbox.status.value).toBe('conflict_detected');
    expect(outbox.errorMessage.value).toBe('Revision conflict.');
  });

  it('retries idempotency-in-progress errors with the same queued write', async () => {
    vi.useFakeTimers();
    try {
      const outbox = useEditorMutationOutbox({ maxRetries: 1, retryDelayMs: 5 });
      const transientError = {
        statusCode: 409,
        data: {
          code: 'idempotency_in_progress',
          error: 'A matching write is already in progress.',
        },
      };
      let attempts = 0;

      const resultPromise = outbox.enqueue(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw transientError;
        }
        return 'ok';
      });

      await vi.advanceTimersByTimeAsync(5);
      await expect(resultPromise).resolves.toBe('ok');
      expect(attempts).toBe(2);
      expect(outbox.status.value).toBe('synced');
      expect(outbox.errorMessage.value).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
