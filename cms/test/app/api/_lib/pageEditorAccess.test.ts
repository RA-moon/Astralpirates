import { describe, expect, it, vi } from 'vitest';

import { resolvePageEditAccess } from '@/app/api/_lib/pageEditorAccess';

const mockPayload = () => ({
  findByID: vi.fn(),
});

describe('resolvePageEditAccess', () => {
  it('returns a null page result when the page is missing', async () => {
    const payload = mockPayload();
    payload.findByID.mockRejectedValueOnce(new Error('not found'));

    const result = await resolvePageEditAccess({
      payload: payload as any,
      pageId: 999,
      user: { id: 5, role: 'captain' },
    });

    expect(result).toEqual({ page: null, canEdit: false });
  });

  it('denies editing when the user has no normalized crew role', async () => {
    const payload = mockPayload();
    payload.findByID.mockResolvedValueOnce({
      id: 10,
      owner: 1,
      editor: null,
    });

    const result = await resolvePageEditAccess({
      payload: payload as any,
      pageId: 10,
      user: { id: 5, role: null },
    });

    expect(result.page).toEqual(
      expect.objectContaining({
        id: 10,
      }),
    );
    expect(result.canEdit).toBe(false);
  });

  it('allows editing when the page editor allowlist includes the actor', async () => {
    const payload = mockPayload();
    payload.findByID.mockResolvedValueOnce({
      id: 11,
      owner: 1,
      editor: {
        allowedUsers: [5],
      },
    });

    const result = await resolvePageEditAccess({
      payload: payload as any,
      pageId: 11,
      user: { id: 5, role: 'seamen' },
    });

    expect(result.canEdit).toBe(true);
  });

  it('allows admin edit override when enabled in effective admin mode', async () => {
    const payload = mockPayload();
    payload.findByID.mockResolvedValueOnce({
      id: 12,
      owner: 1,
      editor: null,
    });

    const result = await resolvePageEditAccess({
      payload: payload as any,
      pageId: 12,
      user: { id: 6, role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    });

    expect(result.canEdit).toBe(true);
  });
});
