import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    canEditFlightPlan: vi.fn(),
  };
});

import { canEditFlightPlan } from '@/app/api/_lib/flightPlanMembers';
import { crewCanEditFlightPlan, hasCrewRole } from '@/src/access/crew';

const mockedCanEditFlightPlan = vi.mocked(canEditFlightPlan);

const makeReq = (user: { id?: unknown; role?: unknown } | null) => ({
  user,
  payload: {
    logger: {
      warn: vi.fn(),
    },
  },
});

describe('crew access helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes website crew roles', () => {
    expect(hasCrewRole({ id: 1, role: 'captain' as any })).toBe(true);
    expect(hasCrewRole({ id: 1, role: null })).toBe(false);
    expect(hasCrewRole(null)).toBe(false);
  });

  it('grants flight-plan edit access to captains without membership lookup', async () => {
    const req = makeReq({ id: 9, role: 'captain' });

    const allowed = await crewCanEditFlightPlan({
      req: req as any,
      id: 77,
    } as any);

    expect(allowed).toBe(true);
    expect(mockedCanEditFlightPlan).not.toHaveBeenCalled();
  });

  it('delegates non-captain mission edit checks to membership capability helper', async () => {
    mockedCanEditFlightPlan.mockResolvedValueOnce(true);
    const req = makeReq({ id: 7, role: 'seamen' });

    const allowed = await crewCanEditFlightPlan({
      req: req as any,
      id: 88,
    } as any);

    expect(allowed).toBe(true);
    expect(mockedCanEditFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: req.payload,
        flightPlanId: 88,
        userId: 7,
      }),
    );
  });
});
