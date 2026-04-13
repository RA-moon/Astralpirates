import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as flightPlanMembers from '@/app/api/_lib/flightPlanMembers';

const {
  canEditFlightPlan,
  ensureOwnerMembership,
  evaluateFlightPlanReadAccess,
  inviteMember,
  isContributorMembership,
  listAcceptedMemberIds,
  loadMembership,
  normaliseId,
  ownerCanInvite,
  sanitizeFlightPlanSlug,
} = flightPlanMembers;

const mockPayload = () => {
  const payload = {
   _store: new Map<string, any>(),
    find: vi.fn(),
    findByID: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
  return payload;
};

describe('flightPlanMembers helpers', () => {
  describe('normaliseId', () => {
    it('extracts numeric ids from different shapes', () => {
      expect(normaliseId(42)).toBe(42);
      expect(normaliseId('5')).toBe(5);
      expect(normaliseId({ id: '7' })).toBe(7);
      expect(normaliseId({ id: { id: '9' } })).toBe(9);
      expect(normaliseId('abc')).toBeNull();
    });
  });

  describe('sanitizeFlightPlanSlug', () => {
    it('trims whitespace and rejects non-strings', () => {
      expect(sanitizeFlightPlanSlug(' mission-1 ')).toBe('mission-1');
      expect(sanitizeFlightPlanSlug('')).toBeNull();
      expect(sanitizeFlightPlanSlug(null)).toBeNull();
    });
  });

  describe('loadMembership', () => {
    it('returns null when ids are invalid', async () => {
      const payload = mockPayload();
      const result = await loadMembership(payload as any, null, 5);
      expect(result).toBeNull();
      expect(payload.find).not.toHaveBeenCalled();
    });
  });

  describe('ensureOwnerMembership', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates a new owner membership when none exists', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValue({ docs: [] });
      payload.create.mockResolvedValue({
        id: 1,
        flightPlan: 10,
        user: 20,
        role: 'owner',
        invitationStatus: 'accepted',
        invitedAt: '2025-01-01T00:00:00.000Z',
        respondedAt: '2025-01-01T00:00:00.000Z',
      });
      const enqueueSpy = vi.spyOn(
        await import('@/src/utils/flightPlanMembershipEvents'),
        'enqueueFlightPlanMembershipEvent',
      ).mockResolvedValue();

      const result = await ensureOwnerMembership({
        payload: payload as any,
        flightPlanId: 10,
        ownerId: 20,
      });

      expect(payload.find).toHaveBeenCalled();
      expect(payload.create).toHaveBeenCalled();
      expect(result?.role).toBe('owner');
      expect(enqueueSpy).toHaveBeenCalled();
    });
  });

  describe('listAcceptedMemberIds', () => {
    it('returns only accepted owner/crew ids', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValue({
        docs: [
          { id: 1, user: 10, flightPlan: 2, role: 'owner', invitationStatus: 'accepted' },
          { id: 2, user: 11, flightPlan: 2, role: 'guest', invitationStatus: 'accepted' },
          { id: 3, user: 12, flightPlan: 2, role: 'crew', invitationStatus: 'accepted' },
          { id: 4, user: 13, flightPlan: 2, role: 'crew', invitationStatus: 'pending' },
        ],
      });

      const memberIds = await listAcceptedMemberIds(payload as any, 2);
      expect(memberIds).toEqual([10, 12]);
    });
  });

  describe('ownerCanInvite', () => {
    it('allows only accepted owners to invite collaborators', async () => {
      const payload = mockPayload();
      payload.find
        .mockResolvedValueOnce({
          docs: [
            {
              id: 1,
              flightPlan: 7,
              user: 9,
              role: 'owner',
              invitationStatus: 'accepted',
              invitedBy: 1,
              invitedAt: '2025-01-01T00:00:00.000Z',
              respondedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          docs: [
            {
              id: 2,
              flightPlan: 7,
              user: 11,
              role: 'crew',
              invitationStatus: 'accepted',
              invitedBy: 1,
              invitedAt: '2025-01-01T00:00:00.000Z',
              respondedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        });

      const ownerResult = await ownerCanInvite({
        payload: payload as any,
        flightPlanId: 7,
        userId: 9,
      });
      expect(ownerResult).toBe(true);

      const crewResult = await ownerCanInvite({
        payload: payload as any,
        flightPlanId: 7,
        userId: 11,
      });
      expect(crewResult).toBe(false);
    });

    it('allows crew organisers when invite flag is enabled', async () => {
      const payload = mockPayload();
      // First call: crew membership lookup
      payload.find.mockResolvedValueOnce({
        docs: [
          {
            id: 3,
            flightPlan: 8,
            user: 15,
            role: 'crew',
            invitationStatus: 'accepted',
            invitedBy: 1,
            invitedAt: '2025-01-01T00:00:00.000Z',
            respondedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
      });

      const result = await ownerCanInvite({
        payload: payload as any,
        flightPlanId: 8,
        userId: 15,
        allowCrewInvites: true,
      });

      expect(result).toBe(true);
    });
  });

  describe('canEditFlightPlan', () => {
    it('allows the owner directly when ownerIdHint matches the actor', async () => {
      const payload = mockPayload();

      const result = await canEditFlightPlan({
        payload: payload as any,
        flightPlanId: 12,
        userId: 44,
        ownerIdHint: 44,
      });

      expect(result).toBe(true);
      expect(payload.find).not.toHaveBeenCalled();
    });

    it('allows captain admin-edit override for non-member editing non-terminal missions', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await canEditFlightPlan({
        payload: payload as any,
        flightPlanId: 12,
        userId: 99,
        ownerIdHint: 44,
        websiteRole: 'captain',
        adminMode: {
          adminViewEnabled: true,
          adminEditEnabled: true,
          eligibility: {
            canUseAdminView: true,
            canUseAdminEdit: true,
          },
        },
      });

      expect(result).toBe(true);
    });

    it('keeps terminal mission edits owner-only even when admin-edit is enabled', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValueOnce({ docs: [] });

      const result = await canEditFlightPlan({
        payload: payload as any,
        flightPlanId: 12,
        userId: 99,
        ownerIdHint: 44,
        websiteRole: 'captain',
        adminMode: {
          adminViewEnabled: true,
          adminEditEnabled: true,
          eligibility: {
            canUseAdminView: true,
            canUseAdminEdit: true,
          },
        },
        status: 'success',
      });

      expect(result).toBe(false);
    });

    it('blocks contributor-origin crew memberships when contributor policy is enforced', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValueOnce({
        docs: [
          {
            id: 5,
            flightPlan: 22,
            user: 9,
            role: 'crew',
            invitationStatus: 'accepted',
            invitedBy: 9,
            invitedAt: '2025-01-01T00:00:00.000Z',
            respondedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await canEditFlightPlan({
        payload: payload as any,
        flightPlanId: 22,
        userId: 9,
        ownerIdHint: 44,
        publicContributions: true,
        enforceContributorPolicy: true,
      });

      expect(result).toBe(false);
    });
  });

  describe('evaluateFlightPlanReadAccess', () => {
    it('allows admin-read override through capability evaluation', () => {
      const result = evaluateFlightPlanReadAccess({
        user: {
          id: 50,
          role: 'quartermaster',
        },
        ownerId: 1,
        membership: null,
        policy: { mode: 'private' },
        adminMode: {
          adminViewEnabled: true,
          adminEditEnabled: false,
          eligibility: {
            canUseAdminView: true,
            canUseAdminEdit: false,
          },
        },
      });

      expect(result).toBe(true);
    });
  });

  describe('isContributorMembership', () => {
    it('detects accepted self-invited crew memberships under public contributions', () => {
      const result = isContributorMembership({
        membership: {
          id: 3,
          flightPlanId: 7,
          userId: 12,
          role: 'crew',
          status: 'accepted',
          invitedById: 12,
          invitedAt: '2025-01-01T00:00:00.000Z',
          respondedAt: '2025-01-01T00:00:00.000Z',
        },
        userId: 12,
        ownerId: 99,
        publicContributions: true,
      });

      expect(result).toBe(true);
    });
  });

  describe('inviteMember', () => {
    it('resets declined memberships back to a pending state on reinvite', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValueOnce({
        docs: [
          {
            id: 50,
            flightPlan: 5,
            user: 3,
            role: 'guest',
            invitationStatus: 'declined',
            invitedBy: 1,
            invitedAt: '2025-01-01T00:00:00.000Z',
            respondedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
      });
      payload.update.mockResolvedValue({
        id: 50,
        flightPlan: 5,
        user: 3,
        role: 'guest',
        invitationStatus: 'pending',
        invitedBy: 9,
        invitedAt: '2025-02-01T00:00:00.000Z',
        respondedAt: null,
      });
      const enqueueSpy = vi
        .spyOn(await import('@/src/utils/flightPlanMembershipEvents'), 'enqueueFlightPlanMembershipEvent')
        .mockResolvedValue();

      const result = await inviteMember({
        payload: payload as any,
        flightPlanId: 5,
        inviterId: 9,
        targetUser: { id: 3, profileSlug: 'ace' } as any,
      });

      expect(payload.create).not.toHaveBeenCalled();
      expect(payload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'flight-plan-memberships',
          id: 50,
          data: expect.objectContaining({
            invitationStatus: 'pending',
            respondedAt: null,
          }),
        }),
      );
      expect(result?.status).toBe('pending');
      expect(result?.respondedAt).toBeNull();

      enqueueSpy.mockRestore();
    });

    it('forces newly created invitations to remain pending until acceptance', async () => {
      const payload = mockPayload();
      payload.find.mockResolvedValueOnce({ docs: [] });
      payload.create.mockResolvedValue({
        id: 77,
        flightPlan: 6,
        user: 4,
        role: 'guest',
        invitationStatus: 'accepted',
        invitedBy: 2,
        invitedAt: '2025-03-01T00:00:00.000Z',
        respondedAt: '2025-03-01T00:00:00.000Z',
      });
      payload.update.mockResolvedValue({
        id: 77,
        flightPlan: 6,
        user: 4,
        role: 'guest',
        invitationStatus: 'pending',
        invitedBy: 2,
        invitedAt: '2025-03-01T00:00:00.000Z',
        respondedAt: null,
      });
      const enqueueSpy = vi
        .spyOn(await import('@/src/utils/flightPlanMembershipEvents'), 'enqueueFlightPlanMembershipEvent')
        .mockResolvedValue();

      const result = await inviteMember({
        payload: payload as any,
        flightPlanId: 6,
        inviterId: 2,
        targetUser: { id: 4, profileSlug: 'nova' } as any,
      });

      expect(payload.create).toHaveBeenCalled();
      expect(payload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'flight-plan-memberships',
          id: 77,
          data: expect.objectContaining({
            invitationStatus: 'pending',
            respondedAt: null,
          }),
        }),
      );
      expect(result?.status).toBe('pending');
      expect(result?.respondedAt).toBeNull();

      enqueueSpy.mockRestore();
    });
  });
});
