import { describe, expect, it, vi } from 'vitest';

import { closePayloadLifecycle } from './payloadRuntime';

describe('closePayloadLifecycle', () => {
  it('calls shutdown before close by default', async () => {
    const shutdown = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);

    await closePayloadLifecycle({ shutdown, close });

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('calls close first when requested', async () => {
    const shutdown = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);

    await closePayloadLifecycle({ shutdown, close }, 'close-first');

    expect(close).toHaveBeenCalledTimes(1);
    expect(shutdown).not.toHaveBeenCalled();
  });

  it('falls back to second method when the preferred one is absent', async () => {
    const close = vi.fn(async () => undefined);

    await closePayloadLifecycle({ close });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('handles nullish and non-lifecycle values safely', async () => {
    await expect(closePayloadLifecycle(null)).resolves.toBeUndefined();
    await expect(closePayloadLifecycle(undefined)).resolves.toBeUndefined();
    await expect(closePayloadLifecycle({})).resolves.toBeUndefined();
    await expect(closePayloadLifecycle('not-an-object')).resolves.toBeUndefined();
  });
});
