import { describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';

import {
  cleanupUnusedFlightPlanGalleryImages,
  cleanupUnusedPageGalleryImages,
} from './galleryCleanup';

const buildPayloadMock = ({
  findResults,
}: {
  findResults: Array<{ docs: Array<{ id: unknown }>; totalPages: number }>;
}) => {
  const find = vi.fn();
  for (const result of findResults) {
    find.mockResolvedValueOnce(result);
  }
  const remove = vi.fn().mockResolvedValue(undefined);
  const warn = vi.fn();

  const payload = {
    find,
    delete: remove,
    logger: { warn },
  } as unknown as Payload;

  return {
    payload,
    find,
    remove,
    warn,
  };
};

describe('cleanupUnusedFlightPlanGalleryImages', () => {
  it('deletes orphan uploads across paginated results', async () => {
    const { payload, find, remove } = buildPayloadMock({
      findResults: [
        { docs: [{ id: 1 }], totalPages: 2 },
        { docs: [{ id: 2 }], totalPages: 2 },
      ],
    });

    await cleanupUnusedFlightPlanGalleryImages({
      payload,
      flightPlanId: 12,
      keepImageIds: [1],
    });

    expect(find).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'gallery-images',
        id: 2,
      }),
    );
  });
});

describe('cleanupUnusedPageGalleryImages', () => {
  it('scans page-owned uploads and deletes unreferenced ids', async () => {
    const { payload, find, remove } = buildPayloadMock({
      findResults: [{ docs: [{ id: 9 }, { id: 10 }], totalPages: 1 }],
    });

    await cleanupUnusedPageGalleryImages({
      payload,
      pageId: 99,
      keepImageIds: [10],
    });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          page: {
            equals: 99,
          },
        },
      }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
      }),
    );
  });
});

