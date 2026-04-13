import { http, HttpResponse } from 'msw';

const API_BASE = process.env.MSW_API_BASE ?? 'http://localhost:3000';

const toUrl = (path: string) => new URL(path, API_BASE).toString();

const sampleMembership = {
  id: 12,
  flightPlanId: 99,
  userId: 7,
  role: 'guest',
  status: 'pending',
  invitedAt: '2025-01-12T00:00:00Z',
  respondedAt: null,
  user: {
    id: 7,
    callSign: 'Quasar',
    profileSlug: 'quasar',
    role: 'crew',
  },
  invitedBy: {
    id: 3,
    callSign: 'Nova',
    profileSlug: 'nova',
    role: 'owner',
  },
};

const sampleInvitee = {
  id: 33,
  callSign: 'Vega',
  profileSlug: 'vega',
  role: 'seaman',
};

export const flightPlanHandlers = [
  http.get(toUrl('/api/flight-plans/voyage/members'), ({ request }) => {
    const auth = request.headers.get('authorization');
    if (auth !== 'Bearer token') {
      return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return HttpResponse.json({ memberships: [sampleMembership] });
  }),

  http.post(toUrl('/api/flight-plans/voyage/members'), async () => {
    return HttpResponse.json({ membership: sampleMembership });
  }),

  http.get(toUrl('/api/flight-plans/voyage/invitees'), ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    if (!query) {
      return HttpResponse.json({ results: [] });
    }
    return HttpResponse.json({ results: [sampleInvitee] });
  }),

  http.patch(toUrl('/api/flight-plans/voyage/members/12'), async () => {
    return HttpResponse.json({
      membership: { ...sampleMembership, role: 'crew', status: 'accepted' },
    });
  }),
];
