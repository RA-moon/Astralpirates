import { createError } from '#app';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { getRequestFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';

type MuteStatus = 'idle' | 'loading' | 'ready' | 'error';

export type FlightPlanMuteRecord = {
  flightPlanId: number;
  muted: boolean;
  mutedAt: string | null;
};

type FlightPlanMutesState = {
  status: MuteStatus;
  error: string | null;
  lastFetchedAt: string | null;
  mutes: Record<string, FlightPlanMuteRecord>;
};

const normaliseId = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normaliseId((value as Record<string, unknown>).id);
  }
  return null;
};

const normaliseMuteRecord = (value: unknown): FlightPlanMuteRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const flightPlanId = normaliseId(record.flightPlanId ?? record.flightPlan);
  if (flightPlanId == null) return null;
  return {
    flightPlanId,
    muted: record.muted !== false,
    mutedAt: typeof record.mutedAt === 'string' ? record.mutedAt : null,
  };
};

const toKey = (flightPlanId: number) => `${flightPlanId}`;

const buildMuteMap = (entries: unknown[]) => {
  const mutes: Record<string, FlightPlanMuteRecord> = {};
  for (const entry of entries) {
    const normalised = normaliseMuteRecord(entry);
    if (!normalised) continue;
    mutes[toKey(normalised.flightPlanId)] = normalised;
  }
  return mutes;
};

export const useFlightPlanMutesStore = defineStore('flight-plan-mutes', {
  state: (): FlightPlanMutesState => ({
    status: 'idle',
    error: null,
    lastFetchedAt: null,
    mutes: {},
  }),
  getters: {
    isLoading: (state) => state.status === 'loading',
    mutedPlanIds: (state) =>
      Object.values(state.mutes)
        .filter((entry) => entry.muted)
        .map((entry) => entry.flightPlanId),
    isMuted: (state) => (flightPlanId: number | null | undefined) => {
      if (flightPlanId == null) return false;
      const entry = state.mutes[toKey(Number(flightPlanId))];
      return entry?.muted ?? false;
    },
  },
  actions: {
    reset() {
      this.status = 'idle';
      this.error = null;
      this.lastFetchedAt = null;
      this.mutes = {};
    },
    setStatus(payload: Partial<Pick<FlightPlanMutesState, 'status' | 'error' | 'mutes'>>) {
      if (payload.status) this.status = payload.status;
      if (typeof payload.error !== 'undefined') this.error = payload.error ?? null;
      if (payload.mutes) this.mutes = payload.mutes;
    },
    setMuteEntry(record: FlightPlanMuteRecord) {
      this.mutes = {
        ...this.mutes,
        [toKey(record.flightPlanId)]: record,
      };
    },
    clearMuteEntry(flightPlanId: number) {
      const key = toKey(flightPlanId);
      if (!this.mutes[key]) return;
      const next = { ...this.mutes };
      delete next[key];
      this.mutes = next;
    },
    async fetchBootstrap({ silentUnauthorized = true }: { silentUnauthorized?: boolean } = {}) {
      const requestFetch = getRequestFetch();
      const session = useSessionStore();
      const accessToken = session.bearerToken;
      if (!accessToken) {
        this.reset();
        return [];
      }

      this.status = 'loading';
      this.error = null;

      try {
        const response = await requestFetch<Record<string, unknown>>('/api/matrix/bootstrap', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = Array.isArray(response?.mutes) ? response?.mutes : [];
        this.mutes = buildMuteMap(payload);
        this.status = 'ready';
        this.lastFetchedAt = new Date().toISOString();
        return Object.values(this.mutes);
      } catch (error: any) {
        const status =
          Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        if (status === 401 || status === 403) {
          session.clearSession();
          this.reset();
          this.status = 'idle';
          if (silentUnauthorized) {
            return [];
          }
        }
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to load Matrix bootstrap data.';
        this.error = message;
        this.status = 'error';
        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
    async fetchMutes({ silentUnauthorized = true }: { silentUnauthorized?: boolean } = {}) {
      const requestFetch = getRequestFetch();
      const session = useSessionStore();
      const accessToken = session.bearerToken;
      if (!accessToken) {
        this.reset();
        return [];
      }

      this.status = 'loading';
      this.error = null;

      try {
        const response = await requestFetch<Record<string, unknown>>('/api/matrix/flight-plan-mutes', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = Array.isArray(response?.mutes) ? response?.mutes : [];
        this.mutes = buildMuteMap(payload);
        this.status = 'ready';
        this.lastFetchedAt = new Date().toISOString();
        return Object.values(this.mutes);
      } catch (error: any) {
        const status =
          Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        if (status === 401 || status === 403) {
          session.clearSession();
          this.reset();
          this.status = 'idle';
          if (silentUnauthorized) {
            return [];
          }
        }
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to load mute preferences.';
        this.error = message;
        this.status = 'error';
        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
    async setMute({ flightPlanId, muted }: { flightPlanId: number; muted: boolean }) {
      const requestFetch = getRequestFetch();
      const session = useSessionStore();
      const accessToken = session.bearerToken;
      if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
      }

      this.status = 'loading';
      this.error = null;

      try {
        const response = await requestFetch<Record<string, unknown>>('/api/matrix/flight-plan-mutes', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: {
            flightPlanId,
            muted,
          },
        });

        const record = normaliseMuteRecord(response ?? { flightPlanId, muted });
        if (record && record.muted) {
          this.setMuteEntry(record);
        } else {
          this.clearMuteEntry(flightPlanId);
        }
        this.status = 'ready';
        this.lastFetchedAt = new Date().toISOString();
        return record;
      } catch (error: any) {
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to update mute preference.';
        this.error = message;
        this.status = 'error';
        throw createError({
          statusCode: Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || 500,
          statusMessage: message,
        });
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFlightPlanMutesStore, import.meta.hot));
}
