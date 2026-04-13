import { describe, expect, it, vi } from 'vitest';

import GalleryImages, {
  pruneGalleryReferencesBeforeDelete,
  sanitizeGalleryOwnership,
} from './GalleryImages';

describe('sanitizeGalleryOwnership', () => {
  it('accepts mission-owned uploads', () => {
    expect(sanitizeGalleryOwnership({ flightPlan: '42' })).toEqual({
      flightPlanId: 42,
      pageId: null,
    });
  });

  it('accepts page-owned uploads', () => {
    expect(sanitizeGalleryOwnership({ page: 9 })).toEqual({
      flightPlanId: null,
      pageId: 9,
    });
  });

  it('accepts unattached uploads for later assignment', () => {
    expect(sanitizeGalleryOwnership({})).toEqual({
      flightPlanId: null,
      pageId: null,
    });
  });

  it('rejects mixed mission + page ownership', () => {
    expect(() =>
      sanitizeGalleryOwnership({
        flightPlan: 3,
        page: 7,
      }),
    ).toThrow('Gallery asset must belong to either a mission or a page, not both.');
  });
});

describe('pruneGalleryReferencesBeforeDelete', () => {
  it('prunes mission references using owner-targeted update', async () => {
    const findByID = vi
      .fn()
      .mockResolvedValueOnce({ id: 91, flightPlan: 44 })
      .mockResolvedValueOnce({
        id: 44,
        visibility: 'crew',
        accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'crew' },
        mediaVisibility: 'inherit',
        crewCanPromotePassengers: true,
        passengersCanCreateTasks: true,
        passengersCanCommentOnTasks: true,
        isPublic: false,
        publicContributions: false,
        gallerySlides: [{ galleryImage: 91 }, { galleryImage: 12 }],
      });
    const update = vi.fn().mockResolvedValue({ id: 44 });
    const find = vi.fn();
    const warn = vi.fn();

    await pruneGalleryReferencesBeforeDelete({
      id: 91,
      req: {
        context: {},
        payload: {
          findByID,
          update,
          find,
          logger: { warn },
        },
      },
    } as any);

    expect(find).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plans',
        id: 44,
        data: expect.objectContaining({
          visibility: 'crew',
          accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'crew' },
          mediaVisibility: 'inherit',
          crewCanPromotePassengers: true,
          passengersCanCreateTasks: true,
          passengersCanCommentOnTasks: true,
          isPublic: false,
          publicContributions: false,
          gallerySlides: [{ galleryImage: 12 }],
        }),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('prunes page references using owner-targeted update', async () => {
    const findByID = vi
      .fn()
      .mockResolvedValueOnce({ id: 91, page: 22 })
      .mockResolvedValueOnce({
        id: 22,
        layout: [
          {
            blockType: 'imageCarousel',
            slides: [{ galleryImage: 91 }, { galleryImage: 73 }],
          },
        ],
      });
    const update = vi.fn().mockResolvedValue({ id: 22 });
    const find = vi.fn();
    const warn = vi.fn();

    await pruneGalleryReferencesBeforeDelete({
      id: 91,
      req: {
        context: {},
        payload: {
          findByID,
          update,
          find,
          logger: { warn },
        },
      },
    } as any);

    expect(find).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        id: 22,
        data: expect.objectContaining({
          layout: [
            {
              blockType: 'imageCarousel',
              slides: [{ galleryImage: 73 }],
            },
          ],
        }),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('gallery uploadedBy immutability', () => {
  const beforeValidate = GalleryImages.hooks?.beforeValidate?.[0];

  it('keeps uploadedBy immutable on update', async () => {
    expect(beforeValidate).toBeTypeOf('function');
    const result = await beforeValidate?.({
      operation: 'update',
      data: {
        uploadedBy: 99,
      },
      originalDoc: {
        uploadedBy: 41,
      },
      req: {
        user: { id: 7 },
      },
    } as any);

    expect((result as any)?.uploadedBy).toBe(41);
  });

  it('preserves owner links on sparse updates', async () => {
    expect(beforeValidate).toBeTypeOf('function');
    const result = await beforeValidate?.({
      operation: 'update',
      data: {
        alt: 'updated',
      },
      originalDoc: {
        uploadedBy: 41,
        flightPlan: 44,
        page: null,
      },
      req: {
        user: { id: 7 },
      },
    } as any);

    expect((result as any)?.uploadedBy).toBe(41);
    expect((result as any)?.flightPlan).toBe(44);
    expect((result as any)?.page).toBeNull();
  });

  it('forces uploadedBy to the authenticated user on create', async () => {
    expect(beforeValidate).toBeTypeOf('function');
    const result = await beforeValidate?.({
      operation: 'create',
      data: {
        uploadedBy: 99,
      },
      req: {
        user: { id: 7 },
      },
    } as any);

    expect((result as any)?.uploadedBy).toBe(7);
  });
});
