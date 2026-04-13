import { createError } from '#app';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { useSessionStore } from './session';
import { getRequestFetch } from '~/modules/api';

interface InvitationRecord {
  purpose?: 'recruit' | 'password_reset' | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  expiresAt?: string | null;
  redeemedAt?: string | null;
  sentAt?: string | null;
  invitedUser?: number | null;
  linkHidden?: boolean;
}

type InvitationStatus = 'idle' | 'loading' | 'ready' | 'error';

interface InvitationsState {
  status: InvitationStatus;
  invite: InvitationRecord | null;
  elsaTokens: number;
  error: string | null;
  lastFetchedAt: string | null;
}

const normaliseInvite = (value: unknown): InvitationRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const purpose =
    record.purpose === 'password_reset' || record.purpose === 'recruit'
      ? (record.purpose as 'recruit' | 'password_reset')
      : null;
  const email = typeof record.email === 'string' ? record.email : null;
  const firstName = typeof record.firstName === 'string' ? record.firstName : null;
  const lastName = typeof record.lastName === 'string' ? record.lastName : null;
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : null;
  const redeemedAt = typeof record.redeemedAt === 'string' ? record.redeemedAt : null;
  const sentAt = typeof record.sentAt === 'string' ? record.sentAt : null;
  const resolveInvitedUser = (raw: unknown): number | null => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (raw && typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)) {
      return resolveInvitedUser((raw as Record<string, unknown>).id);
    }
    return null;
  };
  const invitedUser = resolveInvitedUser(record.invitedUser);
  const linkHidden = record.linkHidden !== false;
  if (
    !email &&
    !firstName &&
    !lastName &&
    !expiresAt &&
    !redeemedAt &&
    !sentAt &&
    invitedUser == null
  ) {
    return null;
  }
  return {
    purpose,
    email,
    firstName,
    lastName,
    expiresAt,
    redeemedAt,
    sentAt,
    invitedUser,
    linkHidden,
  };
};

export const useInvitationsStore = defineStore('invitations', {
  state: (): InvitationsState => ({
    status: 'idle',
    invite: null,
    elsaTokens: 0,
    error: null,
    lastFetchedAt: null,
  }),
  getters: {
    hasOutstandingInvite: (state) =>
      Boolean(state.invite?.email && !state.invite?.redeemedAt),
    isLoading: (state) => state.status === 'loading',
  },
  actions: {
    reset() {
      this.status = 'idle';
      this.invite = null;
      this.elsaTokens = 0;
      this.error = null;
      this.lastFetchedAt = null;
    },
    setStatus(
      payload: { invite?: InvitationRecord | null; elsaTokens?: number; error?: string | null },
      options: { updateTimestamp?: boolean } = {},
    ) {
      const updateTimestamp = options.updateTimestamp ?? true;
      const legacyElsa = (payload as { elsa?: number | string })?.elsa;
      const tokenInput =
        typeof payload.elsaTokens !== 'undefined' ? payload.elsaTokens : legacyElsa;
      if (typeof tokenInput === 'number' && Number.isFinite(tokenInput)) {
        this.elsaTokens = Math.max(0, Math.floor(tokenInput));
      } else if (typeof tokenInput !== 'undefined') {
        this.elsaTokens = Math.max(0, Number(tokenInput) || 0);
      }
      if ('invite' in payload) {
        this.invite = payload.invite ?? null;
      }
      if ('error' in payload) {
        this.error = payload.error ?? null;
      }
      this.lastFetchedAt = updateTimestamp ? new Date().toISOString() : null;
    },
    async fetchStatus({ silentUnauthorized = true }: { silentUnauthorized?: boolean } = {}) {
      const requestFetch = getRequestFetch();
      const session = useSessionStore();
      const accessToken = session.bearerToken;
      if (!accessToken) {
        this.reset();
        this.status = 'idle';
        return null;
      }

      this.status = 'loading';
      this.error = null;

      try {
        const payload = await requestFetch<Record<string, unknown>>('/api/invitations', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const invite = normaliseInvite(payload?.invite);
        const payloadTokens =
          typeof payload?.elsaTokens !== 'undefined' ? payload?.elsaTokens : payload?.elsa;
        const elsaValue =
          typeof payloadTokens === 'number' ? payloadTokens : Number(payloadTokens) || 0;

        this.setStatus({ invite, elsaTokens: elsaValue, error: null });
        this.status = 'ready';
        return { invite, elsaTokens: this.elsaTokens };
      } catch (error: any) {
        const status = Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        if (status === 401 || status === 403) {
          session.clearSession();
          this.reset();
          this.status = 'idle';
          if (silentUnauthorized) {
            return null;
          }
        }
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to load invite status.';
        this.error = message;
        this.status = 'error';
        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
    async requestInvite(payload: { email: string; firstName?: string; lastName?: string }) {
      const requestFetch = getRequestFetch();
      const session = useSessionStore();
      const accessToken = session.bearerToken;
      if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
      }

      this.status = 'loading';
      this.error = null;

      try {
        const response = await requestFetch<Record<string, unknown>>('/api/invitations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: {
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
          },
        });

        const invite = normaliseInvite(response?.invite ?? response);
        const responseTokens =
          typeof response?.elsaTokens !== 'undefined' ? response?.elsaTokens : response?.elsa;
        const elsaValue =
          typeof responseTokens === 'number' ? responseTokens : Number(responseTokens) || this.elsaTokens;

        this.setStatus({ invite, elsaTokens: elsaValue, error: null });
        this.status = 'ready';
        return { invite, elsaTokens: this.elsaTokens };
      } catch (error: any) {
        const status = Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to create invite.';
        this.status = 'error';
        this.error = message;
        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
    async cancelInvite() {
      const requestFetch = getRequestFetch();
      const session = useSessionStore();
      const accessToken = session.bearerToken;
      if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
      }

      this.status = 'loading';
      this.error = null;

      try {
        const response = await requestFetch<Record<string, unknown>>('/api/invitations/cancel', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const invite = normaliseInvite(response?.invite ?? null);
        const responseTokens =
          typeof response?.elsaTokens !== 'undefined' ? response?.elsaTokens : response?.elsa;
        const elsaValue =
          typeof responseTokens === 'number'
            ? responseTokens
            : Number(responseTokens) || this.elsaTokens;
        const message =
          typeof response?.message === 'string' && response.message.length > 0
            ? response.message
            : 'Invitation cancelled.';

        this.setStatus({ invite, elsaTokens: elsaValue, error: null }, { updateTimestamp: false });
        this.status = 'ready';
        return { invite, elsaTokens: this.elsaTokens, message };
      } catch (error: any) {
        const status = Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        if (status === 401 || status === 403) {
          session.clearSession();
          this.reset();
        }
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to cancel invite.';
        this.status = 'error';
        this.error = message;
        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useInvitationsStore, import.meta.hot));
}
