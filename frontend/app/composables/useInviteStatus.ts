import { computed, onScopeDispose, watch } from 'vue';
import type { WatchOptions } from 'vue';
import { storeToRefs } from 'pinia';
import { useInvitationsStore } from '~/stores/invitations';
import { useSessionStore } from '~/stores/session';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
};

export const useInviteStatus = () => {
  const invitations = useInvitationsStore();
  const session = useSessionStore();
  const { invite, elsaTokens, status, error } = storeToRefs(invitations);

  const elsaBalance = computed(() => elsaTokens.value ?? 0);
  const hasInvite = computed(() => Boolean(invite.value?.email && !invite.value?.redeemedAt));
  const invitePurpose = computed(() => invite.value?.purpose ?? null);
  const inviteLinkHidden = computed(() => invite.value?.linkHidden ?? false);
  const inviteEmail = computed(() => invite.value?.email ?? '');
  const inviteExpiry = computed(() => formatDateTime(invite.value?.expiresAt ?? null));
  const inviteFirstName = computed(() => invite.value?.firstName ?? '');
  const inviteLastName = computed(() => invite.value?.lastName ?? '');
  const inviteSentAt = computed(() => formatDateTime(invite.value?.sentAt ?? null));
  const inviteRedeemedAt = computed(() => formatDateTime(invite.value?.redeemedAt ?? null));
  const isLoading = computed(() => status.value === 'loading');

  const shouldRefreshStatus = ({ maxAgeMs = 30_000 }: { maxAgeMs?: number } = {}) => {
    if (!invitations.lastFetchedAt) return true;
    const last = Date.parse(invitations.lastFetchedAt);
    if (Number.isNaN(last)) return true;
    return Date.now() - last > maxAgeMs;
  };

  const hydrateStatus = async ({
    silent = true,
    force = false,
    maxAgeMs = 30_000,
    retry = 0,
  }: { silent?: boolean; force?: boolean; maxAgeMs?: number; retry?: number } = {}) => {
    if (!session.isAuthenticated) {
      invitations.reset();
      return { ok: false, message: 'Authentication required.' };
    }
    if (!force && !shouldRefreshStatus({ maxAgeMs })) {
      return { ok: true, message: 'Invite status is current.' };
    }
    let attempt = 0;
    let lastError: any;
    const maxAttempts = Math.max(0, retry) + 1;
    while (attempt < maxAttempts) {
      try {
        await invitations.fetchStatus({ silentUnauthorized: silent });
        return { ok: true, message: 'Invite status updated.' };
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt >= maxAttempts) break;
      }
    }
    const message =
      lastError?.statusMessage ||
      lastError?.data?.error ||
      lastError?.message ||
      'Unable to load invite status.';
    return { ok: false, message };
  };

  const cancelInvite = async () => {
    try {
      const result = await invitations.cancelInvite();
      return {
        ok: true,
        message: result?.message ?? 'Invite cancelled.',
      };
    } catch (err: any) {
      const message =
        err?.statusMessage || err?.data?.error || err?.message || 'Unable to cancel invite.';
      return { ok: false, message };
    }
  };

  const requestInvite = async (payload: { firstName: string; lastName: string; email: string }) => {
    try {
      await invitations.requestInvite(payload);
      return {
        ok: true,
        message: 'Invitation dispatched. We emailed the enlistment link directly to your recruit.',
      };
    } catch (err: any) {
      const message =
        err?.statusMessage || err?.data?.error || err?.message || 'Unable to create an invite.';
      return { ok: false, message };
    }
  };

  const onStatusUpdate = (
    listener: (payload: { status: typeof status.value; error: string | null }) => void,
    options?: WatchOptions,
  ) => {
    const stop = watch(
      [status, error],
      ([nextStatus, nextError]) => {
        listener({ status: nextStatus, error: nextError ?? null });
      },
      { immediate: true, ...(options ?? {}) },
    );
    onScopeDispose(stop);
    return stop;
  };

  return {
    invite,
    status,
    error,
    elsaBalance,
    hasInvite,
    invitePurpose,
    inviteLinkHidden,
    inviteEmail,
    inviteExpiry,
    inviteFirstName,
    inviteLastName,
    inviteSentAt,
    inviteRedeemedAt,
    isLoading,
    hydrateStatus,
    shouldRefreshStatus,
    cancelInvite,
    requestInvite,
    onStatusUpdate,
  };
};
