import { describe, expect, it, vi } from 'vitest';

import { runLogMaintenance, updateLogDoc } from './logMaintenance';

describe('runLogMaintenance', () => {
  it('iterates pages and tracks processed/updated counts', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 1 }, { id: 2 }],
        page: 1,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 3 }],
        page: 2,
        totalPages: 2,
      });

    const onDoc = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await runLogMaintenance({
      payload: { find },
      onDoc,
    });

    expect(find).toHaveBeenCalledTimes(2);
    expect(onDoc).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ processed: 3, updated: 2 });
  });

  it('returns zero counts when no docs are found', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [],
      page: 1,
      totalPages: 1,
    });
    const onDoc = vi.fn();

    const result = await runLogMaintenance({
      payload: { find },
      onDoc,
    });

    expect(find).toHaveBeenCalledTimes(1);
    expect(onDoc).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, updated: 0 });
  });

  it('updates a log with shared override options', async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    await updateLogDoc({
      payload: { update },
      id: 42,
      data: { slug: '20260409010101' },
    });

    expect(update).toHaveBeenCalledWith({
      collection: 'logs',
      id: 42,
      data: { slug: '20260409010101' },
      overrideAccess: true,
      showHiddenFields: true,
    });
  });
});
