import { describe, expect, it } from 'vitest';

import { canUserReadFlightPlan } from '@/app/api/_lib/accessPolicy';

describe('accessPolicy flight-plan read checks', () => {
  it('allows anonymous viewers for public mission policy', () => {
    expect(
      canUserReadFlightPlan({
        user: null,
        ownerId: 9,
        policy: { mode: 'public' },
      }),
    ).toBe(true);
  });

  it('allows accepted passengers when mission policy minimum is passenger', () => {
    expect(
      canUserReadFlightPlan({
        user: { id: 42, role: 'seamen' },
        ownerId: 9,
        membershipRole: 'guest',
        policy: {
          mode: 'role',
          roleSpace: 'flight-plan',
          minimumRole: 'passenger',
        },
      }),
    ).toBe(true);
  });

  it('blocks non-members for private mission policy without admin view', () => {
    expect(
      canUserReadFlightPlan({
        user: { id: 42, role: 'quartermaster' },
        ownerId: 9,
        membershipRole: null,
        policy: { mode: 'private' },
        adminMode: {
          adminViewEnabled: false,
          adminEditEnabled: false,
          eligibility: {
            canUseAdminView: true,
            canUseAdminEdit: false,
          },
        },
      }),
    ).toBe(false);
  });

  it('allows quartermaster admin visibility override for private mission read', () => {
    expect(
      canUserReadFlightPlan({
        user: { id: 42, role: 'quartermaster' },
        ownerId: 9,
        membershipRole: null,
        policy: { mode: 'private' },
        adminMode: {
          adminViewEnabled: true,
          adminEditEnabled: false,
          eligibility: {
            canUseAdminView: true,
            canUseAdminEdit: false,
          },
        },
      }),
    ).toBe(true);
  });
});
