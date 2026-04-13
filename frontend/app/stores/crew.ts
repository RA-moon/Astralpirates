import { createError } from '#app';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { getRequestFetch } from '~/modules/api';
import {
  normalizeAvatarMediaRecord,
  type AvatarMediaType,
} from '~/modules/media/avatarMedia';

export interface CrewMember {
  id?: string | number;
  profileSlug: string;
  displayName: string;
  callSign?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  avatarMediaType?: AvatarMediaType | null;
  avatarMediaUrl?: string | null;
  avatarMimeType?: string | null;
  avatarFilename?: string | null;
  isOnline?: boolean;
  lastActiveAt?: string | null;
  currentRoute?: string | null;
}

type CrewStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CrewState {
  status: CrewStatus;
  members: CrewMember[];
  lastFetchedAt: string | null;
  error: string | null;
}

const normaliseMember = (value: unknown): CrewMember | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const profileSlug =
    typeof record.profileSlug === 'string'
      ? record.profileSlug
      : typeof record.slug === 'string'
        ? record.slug
        : null;
  if (!profileSlug) return null;

  const displayName =
    typeof record.displayName === 'string'
      ? record.displayName
      : typeof record.callSign === 'string'
        ? record.callSign
        : typeof record.name === 'string'
          ? record.name
          : profileSlug;

  const lastActiveAt =
    typeof record.lastActiveAt === 'string'
      ? record.lastActiveAt
      : typeof record.lastActive === 'string'
        ? record.lastActive
        : typeof record.activity === 'string'
          ? record.activity
          : null;

  const now = Date.now();
  const lastActiveMs = lastActiveAt ? Date.parse(lastActiveAt) : NaN;
  const derivedOnline = Number.isFinite(lastActiveMs) && now - lastActiveMs <= 180_000;
  const isOnline =
    typeof record.isOnline === 'boolean'
      ? record.isOnline
      : typeof record.online === 'boolean'
        ? record.online
        : derivedOnline;
  const avatarMedia = normalizeAvatarMediaRecord({
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : null,
    avatarMediaType: record.avatarMediaType,
    avatarMediaUrl: typeof record.avatarMediaUrl === 'string' ? record.avatarMediaUrl : null,
    avatarMimeType: typeof record.avatarMimeType === 'string' ? record.avatarMimeType : null,
    avatarFilename: typeof record.avatarFilename === 'string' ? record.avatarFilename : null,
  });

  return {
    id: record.id as string | number | undefined,
    profileSlug,
    displayName,
    callSign: typeof record.callSign === 'string' ? record.callSign : null,
    role: typeof record.role === 'string' ? record.role : null,
    avatarUrl: avatarMedia.avatarUrl,
    avatarMediaType: avatarMedia.avatarMediaType,
    avatarMediaUrl: avatarMedia.avatarMediaUrl,
    avatarMimeType: avatarMedia.avatarMimeType,
    avatarFilename: avatarMedia.avatarFilename,
    isOnline,
    lastActiveAt,
    currentRoute: typeof record.currentRoute === 'string' ? record.currentRoute : null,
  };
};

const extractMembers = (payload: unknown): CrewMember[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map(normaliseMember).filter(Boolean) as CrewMember[];
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates =
      record.members ??
      record.items ??
      record.profiles ??
      record.users ??
      record.results ??
      null;
    if (Array.isArray(candidates)) {
      return candidates.map(normaliseMember).filter(Boolean) as CrewMember[];
    }
  }
  return [];
};

export const useCrewStore = defineStore('crew', {
  state: (): CrewState => ({
    status: 'idle',
    members: [],
    lastFetchedAt: null,
    error: null,
  }),
  getters: {
    isLoading: (state) => state.status === 'loading',
    hasMembers: (state) => state.members.length > 0,
  },
  actions: {
    reset() {
      this.status = 'idle';
      this.members = [];
      this.lastFetchedAt = null;
      this.error = null;
    },
    setMembers(list: CrewMember[]) {
      this.members = list;
      this.lastFetchedAt = new Date().toISOString();
      this.status = 'ready';
      this.error = null;
    },
    async fetchMembers({
      apiPath = '/api/crew',
      query,
    }: {
      apiPath?: string;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}) {
      const requestFetch = getRequestFetch();

      this.status = 'loading';
      this.error = null;

      try {
        const apiOptions: Record<string, unknown> = {
          method: 'GET',
          query,
        };

        const data = await requestFetch<unknown>(apiPath, apiOptions);
        const members = extractMembers(data);

        if (!members || members.length === 0) {
          throw createError({
            statusCode: 404,
            statusMessage: 'Crew manifest is empty.',
          });
        }

        this.setMembers(members);
        return members;
      } catch (error: any) {
        const status = Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.message ||
          'Unable to fetch crew manifest.';
        this.status = 'error';
        this.error = message;
        this.members = [];

        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCrewStore, import.meta.hot));
}
