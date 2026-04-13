import { computed, ref } from 'vue';
import type { $Fetch } from 'ofetch';
import { getRequestFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';

export type InviteSummary = {
  membershipId: number;
  flightPlanId: number;
  status: string;
  role: string;
  invitedAt: string | null;
  respondedAt: string | null;
  flightPlan: {
    id: number | null;
    title: string | null;
    slug: string | null;
    path: string | null;
    location: string | null;
    displayDate: string | null;
  } | null;
  invitedBy: {
    id: number | null;
    callSign: string | null;
    profileSlug: string | null;
    role: string | null;
  } | null;
};

type InviteResponse = {
  invites: InviteSummary[];
};

type RespondResponse = {
  membership: InviteSummary | null;
};

const invites = ref<InviteSummary[]>([]);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const pendingMemberships = ref(new Set<number>());

const resolveAuthHeader = (token: string | null | undefined) => {
  if (!token) return null;
  const trimmed = token.trim();
  return trimmed ? `Bearer ${trimmed}` : null;
};

const withAuthFetch = (token: string | null | undefined): $Fetch => {
  const fetcher = getRequestFetch();
  return ((request, options = {}) => {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    const authHeader = resolveAuthHeader(token);
    if (authHeader) {
      headers.set('Authorization', authHeader);
    }
    return fetcher(request, {
      ...options,
      headers,
    });
  }) as $Fetch;
};

export const useFlightPlanInvites = () => {
  const session = useSessionStore();

  const loadInvites = async () => {
    if (!session.isAuthenticated) {
      invites.value = [];
      return { ok: true as const, invites: [] };
    }
    loading.value = true;
    errorMessage.value = null;
    const fetcher = withAuthFetch(session.bearerToken);
    try {
      const response = await fetcher<InviteResponse>('/api/flight-plans/invitations', {
        method: 'GET',
      });
      invites.value = Array.isArray(response.invites) ? response.invites : [];
      return { ok: true as const, invites: invites.value };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load invitations.';
      errorMessage.value = message;
      return { ok: false as const, message };
    } finally {
      loading.value = false;
    }
  };

  const respondToInvite = async (membershipId: number, action: 'accept' | 'decline') => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    if (pendingMemberships.value.has(membershipId)) {
      return { ok: false as const, message: 'Another action is still processing.' };
    }

    const fetcher = withAuthFetch(session.bearerToken);
    pendingMemberships.value.add(membershipId);
    try {
      const response = await fetcher<RespondResponse>(`/api/flight-plan-memberships/${membershipId}`, {
        method: 'PATCH',
        body: { action },
      });
      invites.value = invites.value.filter((invite) => invite.membershipId !== membershipId);
      return { ok: true as const, membership: response.membership };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update invitation.';
      return { ok: false as const, message };
    } finally {
      pendingMemberships.value.delete(membershipId);
    }
  };

  const hasInvites = computed(() => invites.value.length > 0);
  const isLoading = computed(() => loading.value);
  const error = computed(() => errorMessage.value);
  const isMembershipPending = (membershipId: number) => pendingMemberships.value.has(membershipId);

  return {
    invites,
    hasInvites,
    isLoading,
    error,
    loadInvites,
    acceptInvite: (membershipId: number) => respondToInvite(membershipId, 'accept'),
    declineInvite: (membershipId: number) => respondToInvite(membershipId, 'decline'),
    isMembershipPending,
  };
};
