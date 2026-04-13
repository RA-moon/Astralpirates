import { getRequestFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';
import type { LogSummary } from '~/modules/api/schemas';

export type CrewFlightPlanMembership = {
  membershipId: number;
  flightPlanId: number;
  role: string;
  flightPlan: {
    id: number;
    title: string | null;
    slug: string | null;
    displayDate: string | null;
  } | null;
};

const withSessionHeaders = () => {
  const session = useSessionStore();
  const headers: Record<string, string> = {};
  if (session.bearerToken) {
    headers.Authorization = `Bearer ${session.bearerToken}`;
  }
  return headers;
};

export const createLogEntry = async ({
  title,
  body,
  flightPlanId,
}: {
  title: string;
  body: string;
  flightPlanId?: number | null;
}) => {
  const payload: Record<string, unknown> = { title, body };
  if (flightPlanId != null) payload.flightPlanId = flightPlanId;

  const requestFetch = getRequestFetch();
  return requestFetch<{ log: LogSummary }>('/api/logs', {
    method: 'POST',
    body: payload,
    headers: withSessionHeaders(),
  });
};

export const fetchCrewFlightPlans = async (): Promise<CrewFlightPlanMembership[]> => {
  const requestFetch = getRequestFetch();
  const response = await requestFetch<{ memberships: CrewFlightPlanMembership[] }>(
    '/api/flight-plan-memberships/me',
    {
      method: 'GET',
      headers: withSessionHeaders(),
    },
  );
  return Array.isArray(response.memberships) ? response.memberships : [];
};
