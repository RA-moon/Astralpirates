import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFlightPlanIteration,
  fetchFlightPlanMembers,
  inviteFlightPlanMember,
  normaliseFlightPlanSlug,
  promoteFlightPlanMember,
  reopenFlightPlan,
  searchFlightPlanInvitees,
  transitionFlightPlanStatus,
  updateFlightPlan,
} from '~/domains/flightPlans';

const fetchMock = vi.fn();
const sessionRefreshMock = vi.fn();
const sessionClearMock = vi.fn();

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => fetchMock,
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => ({
    bearerToken: null,
    refresh: sessionRefreshMock,
    clearSession: sessionClearMock,
  }),
}));

describe('flightPlanCrewClient', () => {
  const sampleMembership = {
    id: 11,
    flightPlanId: 42,
    userId: 7,
    role: 'guest',
    status: 'pending',
    invitedAt: '2025-01-02T00:00:00.000Z',
    respondedAt: null,
    user: { id: 7, callSign: 'Orion', profileSlug: 'orion', role: 'crew' },
    invitedBy: { id: 5, callSign: 'Nova', profileSlug: 'nova', role: 'owner' },
  } as const;

  beforeEach(() => {
    fetchMock.mockReset();
    sessionRefreshMock.mockReset();
    sessionClearMock.mockReset();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('astralpirates-session');
    }
  });

  const expectAuthHeader = (
    options: { headers?: Headers | Record<string, string> } | undefined,
    token: string,
  ) => {
    expect(options?.headers).toBeInstanceOf(Headers);
    expect((options?.headers as Headers | undefined)?.get('Authorization')).toBe(`Bearer ${token}`);
  };

  it('normalises flight plan slugs', () => {
    expect(normaliseFlightPlanSlug('  stars  ')).toBe('stars');
    expect(normaliseFlightPlanSlug(undefined)).toBeNull();
  });

  it('does not auto-attach bearer auth when explicit auth is missing', async () => {
    fetchMock.mockResolvedValue({ memberships: [sampleMembership] });

    await fetchFlightPlanMembers({ auth: null, slug: 'voyage' });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect((options?.headers as Headers | undefined)?.has('Authorization')).toBe(false);
  });

  it('fetches crew memberships for a slug', async () => {
    fetchMock.mockResolvedValue({ memberships: [sampleMembership] });

    const result = await fetchFlightPlanMembers({ auth: 'token', slug: ' deep dive ' });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/deep%20dive/members');
    expect(options).toMatchObject({ method: 'GET' });
    expectAuthHeader(options, 'token');
    expect(result).toEqual([sampleMembership]);
  });

  it('throws when fetching with an empty slug', async () => {
    await expect(fetchFlightPlanMembers({ auth: null, slug: '   ' })).rejects.toThrow(
      'Invalid flight plan slug.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('invites a crew member', async () => {
    fetchMock.mockResolvedValue({ membership: sampleMembership });

    const result = await inviteFlightPlanMember({
      auth: 'token',
      slug: 'chart-course',
      crewSlug: 'aurora',
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/chart-course/members');
    expect(options).toMatchObject({ method: 'POST', body: { slug: 'aurora' } });
    expectAuthHeader(options, 'token');
    expect(result).toEqual(sampleMembership);
  });

  it('searches invitees only when query provided', async () => {
    const empty = await searchFlightPlanInvitees({ auth: 'token', slug: 'voyage', query: '   ' });
    expect(empty).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue({ results: [{ id: 3, callSign: 'Vega', profileSlug: 'vega', role: 'crew' }] });
    const results = await searchFlightPlanInvitees({ auth: 'token', slug: 'voyage', query: 'veg' });
    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/voyage/invitees');
    expect(options).toMatchObject({ method: 'GET', params: { q: 'veg' } });
    expectAuthHeader(options, 'token');
    expect(results).toHaveLength(1);
  });

  it('promotes a guest to crew', async () => {
    fetchMock.mockResolvedValue({ membership: { ...sampleMembership, role: 'crew', status: 'accepted' } });

    const result = await promoteFlightPlanMember({
      auth: 'token',
      slug: 'voyage',
      membershipId: 11,
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/voyage/members/11');
    expect(options).toMatchObject({
      method: 'PATCH',
      body: { action: 'promote', role: 'crew' },
    });
    expectAuthHeader(options, 'token');
    expect(result?.role).toBe('crew');
  });

  it('updates a flight plan via PATCH', async () => {
    fetchMock.mockResolvedValue({ plan: { slug: 'voyage' } });

    await updateFlightPlan({
      auth: 'token',
      slug: 'voyage',
      payload: { title: 'Updated course' },
      baseRevision: 7,
      sessionId: 'editor-session-1',
      idempotencyKey: 'write-1',
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/voyage');
    expect(options).toMatchObject({
      method: 'PATCH',
      body: { title: 'Updated course', baseRevision: 7, sessionId: 'editor-session-1' },
    });
    expectAuthHeader(options, 'token');
    expect((options?.headers as Headers).get('x-editor-session-id')).toBe('editor-session-1');
    expect((options?.headers as Headers).get('x-idempotency-key')).toBe('write-1');
  });

  it('retries flight-plan updates after refreshing an expired token', async () => {
    fetchMock
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce({ plan: { slug: 'voyage' } });
    sessionRefreshMock.mockResolvedValue({ token: 'fresh-token' });

    await updateFlightPlan({
      auth: 'expired-token',
      slug: 'voyage',
      payload: { title: 'Updated course' },
      baseRevision: 11,
      sessionId: 'editor-session-2',
      idempotencyKey: 'write-2',
    });

    const [, firstOptions] = fetchMock.mock.calls[0] ?? [];
    const [, secondOptions] = fetchMock.mock.calls[1] ?? [];
    expectAuthHeader(firstOptions, 'expired-token');
    expectAuthHeader(secondOptions, 'fresh-token');
    expect((firstOptions?.headers as Headers).get('x-editor-session-id')).toBe('editor-session-2');
    expect((secondOptions?.headers as Headers).get('x-editor-session-id')).toBe('editor-session-2');
    expect((firstOptions?.headers as Headers).get('x-idempotency-key')).toBe('write-2');
    expect((secondOptions?.headers as Headers).get('x-idempotency-key')).toBe('write-2');
    expect(sessionRefreshMock).toHaveBeenCalledTimes(1);
    expect(sessionClearMock).not.toHaveBeenCalled();
  });

  it('transitions flight-plan lifecycle status', async () => {
    fetchMock.mockResolvedValue({ plan: { slug: 'voyage', status: 'pending' } });

    await transitionFlightPlanStatus({
      auth: 'token',
      slug: 'voyage',
      status: 'pending',
      statusReason: null,
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/voyage/status');
    expect(options).toMatchObject({
      method: 'POST',
      body: { status: 'pending', statusReason: null },
    });
    expectAuthHeader(options, 'token');
  });

  it('reopens flight plans to pending', async () => {
    fetchMock.mockResolvedValue({ plan: { slug: 'voyage', status: 'pending' } });

    await reopenFlightPlan({
      auth: 'token',
      slug: 'voyage',
      statusReason: 'Reopening after validating remediation tasks and release blockers.',
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/voyage/reopen');
    expect(options).toMatchObject({
      method: 'POST',
      body: {
        statusReason: 'Reopening after validating remediation tasks and release blockers.',
      },
    });
    expectAuthHeader(options, 'token');
  });

  it('creates a next mission iteration', async () => {
    fetchMock.mockResolvedValue({ plan: { slug: 'voyage-iter-2', status: 'planned' } });

    await createFlightPlanIteration({
      auth: 'token',
      slug: 'voyage',
      payload: {
        title: 'Voyage Iteration 2',
        eventDate: '2026-04-10',
      },
    });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('/api/flight-plans/voyage/iterations');
    expect(options).toMatchObject({
      method: 'POST',
      body: {
        title: 'Voyage Iteration 2',
        eventDate: '2026-04-10',
      },
    });
    expectAuthHeader(options, 'token');
  });
});
