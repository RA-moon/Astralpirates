import { describe, expect, it, vi } from 'vitest';
import {
  fetchFlightPlanMembers,
  inviteFlightPlanMember,
  promoteFlightPlanMember,
  searchFlightPlanInvitees,
} from '~/domains/flightPlans';

const apiBase = 'http://localhost:3000';

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({
    astralApiBase: apiBase,
    public: { astralApiBase: apiBase },
  }),
  useRequestFetch: () => undefined,
}));

describe('flightPlanCrewClient integration', () => {
  it('performs crew lifecycle over HTTP wrapper', async () => {
    const fetched = await fetchFlightPlanMembers({ auth: 'token', slug: 'voyage' });
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toMatchObject({ role: 'guest', status: 'pending' });

    const invited = await inviteFlightPlanMember({
      auth: 'token',
      slug: 'voyage',
      crewSlug: 'vega',
    });
    expect(invited.role).toBe('guest');

    const search = await searchFlightPlanInvitees({ auth: 'token', slug: 'voyage', query: 'veg' });
    expect(search).toEqual([
      expect.objectContaining({ profileSlug: 'vega' }),
    ]);

    const promoted = await promoteFlightPlanMember({ auth: 'token', slug: 'voyage', membershipId: 12 });
    expect(promoted.role).toBe('crew');
  });
});
