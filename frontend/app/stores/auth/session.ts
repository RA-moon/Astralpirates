import { createError, useRuntimeConfig } from '#app';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { getRequestFetch } from '~/modules/api';
import {
  normalizeAvatarMediaRecord,
  type AvatarMediaType,
} from '~/modules/media/avatarMedia';

const STORAGE_KEY = 'astralpirates-session';

const parseBooleanFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const shouldPersistSessionTokenInStorage = (): boolean => {
  try {
    const runtimeConfig = useRuntimeConfig();
    if (parseBooleanFlag((runtimeConfig.public as Record<string, unknown> | undefined)?.e2eKeepSessionToken)) {
      return true;
    }
  } catch {
    // Runtime config can be unavailable in isolated test harnesses.
  }
  return parseBooleanFlag((process as { env?: Record<string, string | undefined> } | undefined)?.env?.NUXT_PUBLIC_E2E_KEEP_SESSION_TOKEN);
};

type LegacyProcess = { client?: boolean; dev?: boolean };

const getLegacyProcess = (): LegacyProcess | null => {
  if (typeof process === 'undefined') return null;
  return process as unknown as LegacyProcess;
};

const isRuntimeClient = (): boolean => import.meta.client || getLegacyProcess()?.client === true;
const isRuntimeDev = (): boolean => import.meta.dev || getLegacyProcess()?.dev === true;

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

export interface SessionUser {
  id: string | number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  callSign?: string | null;
  profileSlug?: string | null;
  role?: string | null;
  roles?: string[];
  avatarUrl?: string | null;
  avatarMediaType?: AvatarMediaType | null;
  avatarMediaUrl?: string | null;
  avatarMimeType?: string | null;
  avatarFilename?: string | null;
  adminModePreferences?: {
    adminViewEnabled: boolean;
    adminEditEnabled: boolean;
  } | null;
}

export interface SessionData {
  token?: string | null;
  user: SessionUser;
  exp?: string | null;
  expiresAt?: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

interface SessionState {
  status: AuthStatus;
  session: SessionData | null;
  initialised: boolean;
}

type ParseSessionOptions = {
  allowTokenless?: boolean;
};

const normaliseToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseEpochSeconds = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const parseExpiresAtSeconds = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return Math.floor(timestamp / 1000);
    }
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  return null;
};

const normaliseSessionExpiry = (exp: unknown, expiresAt: unknown) => {
  const expSeconds = parseEpochSeconds(exp);
  const expiresAtSeconds = parseExpiresAtSeconds(expiresAt);
  const resolvedSeconds = expSeconds ?? expiresAtSeconds;

  return {
    exp: resolvedSeconds ? String(resolvedSeconds) : null,
    expiresAt: resolvedSeconds ? new Date(resolvedSeconds * 1000).toISOString() : null,
    isExpired:
      typeof resolvedSeconds === 'number' &&
      resolvedSeconds <= Math.floor(Date.now() / 1000),
  };
};

const parseSession = (value: unknown, options: ParseSessionOptions = {}): SessionData | null => {
  const allowTokenless = options.allowTokenless ?? false;
  if (!value || typeof value !== 'object') return null;
  const { token, user, exp, expiresAt } = value as Record<string, unknown>;
  const normalisedToken = normaliseToken(token);
  if (!allowTokenless && !normalisedToken) return null;
  if (!user || typeof user !== 'object') return null;
  const userRecord = user as Record<string, unknown>;
  const avatarMedia = normalizeAvatarMediaRecord({
    avatarUrl: userRecord.avatarUrl as string | null | undefined,
    avatarMediaType: userRecord.avatarMediaType,
    avatarMediaUrl: userRecord.avatarMediaUrl as string | null | undefined,
    avatarMimeType: userRecord.avatarMimeType as string | null | undefined,
    avatarFilename: userRecord.avatarFilename as string | null | undefined,
  });
  const adminModePreferencesRaw = userRecord.adminModePreferences;
  const adminModePreferences =
    adminModePreferencesRaw &&
    typeof adminModePreferencesRaw === 'object'
      ? {
          adminViewEnabled: Boolean(
            (adminModePreferencesRaw as Record<string, unknown>).adminViewEnabled,
          ),
          adminEditEnabled: Boolean(
            (adminModePreferencesRaw as Record<string, unknown>).adminEditEnabled,
          ),
        }
      : null;
  const normalisedUser: SessionUser = {
    id: userRecord.id as string | number,
    email: String(userRecord.email ?? ''),
    firstName: userRecord.firstName as string | null | undefined ?? null,
    lastName: userRecord.lastName as string | null | undefined ?? null,
    callSign: userRecord.callSign as string | null | undefined ?? null,
    profileSlug: userRecord.profileSlug as string | null | undefined ?? null,
    role: userRecord.role as string | null | undefined ?? null,
    roles: Array.isArray(userRecord.roles)
      ? (userRecord.roles as string[]).map(String)
      : [],
    avatarUrl: avatarMedia.avatarUrl,
    avatarMediaType: avatarMedia.avatarMediaType,
    avatarMediaUrl: avatarMedia.avatarMediaUrl,
    avatarMimeType: avatarMedia.avatarMimeType,
    avatarFilename: avatarMedia.avatarFilename,
    adminModePreferences,
  };
  if (!normalisedUser.email) return null;
  const expiry = normaliseSessionExpiry(exp, expiresAt);
  if (expiry.isExpired) return null;
  return {
    token: normalisedToken,
    user: normalisedUser,
    exp: expiry.exp,
    expiresAt: expiry.expiresAt,
  };
};

const readStoredSession = (): SessionData | null => {
  if (!isRuntimeClient()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parseSession(parsed, { allowTokenless: true });
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!shouldPersistSessionTokenInStorage()) {
      // Storage is intentionally tokenless by default; scrub legacy token-bearing payloads in-place.
      const tokenlessSession = {
        ...session,
        token: null,
      };
      if (session.token) {
        writeStoredSession(tokenlessSession);
      }
      return tokenlessSession;
    }
    return session;
  } catch (error) {
    if (isRuntimeDev()) {
      // eslint-disable-next-line no-console
      console.warn('[session] Failed to read stored session', error);
    }
    return null;
  }
};

const serialiseSessionForStorage = (session: SessionData): SessionData | Omit<SessionData, 'token'> =>
  shouldPersistSessionTokenInStorage()
    ? {
        token: session.token ?? null,
        user: session.user,
        exp: session.exp ?? null,
        expiresAt: session.expiresAt ?? null,
      }
    : {
        user: session.user,
        exp: session.exp ?? null,
        expiresAt: session.expiresAt ?? null,
      };

const writeStoredSession = (session: SessionData | null) => {
  if (!isRuntimeClient()) return;
  try {
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialiseSessionForStorage(session)));
    }
  } catch (error) {
    if (isRuntimeDev()) {
      // eslint-disable-next-line no-console
      console.warn('[session] Failed to persist session', error);
    }
  }
};

const broadcastSessionChange = (session: SessionData | null) => {
  if (!isRuntimeClient()) return;
  try {
    const safeSession = session
      ? {
          ...session,
          token: null,
        }
      : null;
    window.dispatchEvent(
      new CustomEvent('astral:session-changed', {
        detail: { session: safeSession ? JSON.parse(JSON.stringify(safeSession)) : null },
      }),
    );
  } catch (error) {
    if (isRuntimeDev()) {
      // eslint-disable-next-line no-console
      console.warn('[session] Failed to broadcast session change', error);
    }
  }
};

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    status: 'unknown',
    session: null,
    initialised: false,
  }),
  getters: {
    isAuthenticated: (state) => state.status === 'authenticated' && Boolean(state.session?.user?.id),
    bearerToken: (state) => normaliseToken(state.session?.token),
    currentUser: (state) => state.session?.user ?? null,
    storageKey: () => STORAGE_KEY,
  },
  actions: {
    setSession(payload: SessionData) {
      const parsed = parseSession(payload, { allowTokenless: true });
      if (!parsed) {
        this.clearSession();
        return;
      }
      this.session = parsed;
      this.status = 'authenticated';
      this.initialised = true;
      writeStoredSession(parsed);
      broadcastSessionChange(parsed);
    },
    clearSession() {
      this.session = null;
      this.status = 'unauthenticated';
      this.initialised = true;
      writeStoredSession(null);
      broadcastSessionChange(null);
    },
    markUnauthenticated() {
      this.status = 'unauthenticated';
      if (this.session) {
        this.session = null;
      }
      this.initialised = true;
    },
    initialiseFromStorage(force = false) {
      if (this.initialised && !force) return;
      const stored = readStoredSession();
      if (stored) {
        this.session = stored;
        this.status = 'authenticated';
        if (isRuntimeClient()) {
          broadcastSessionChange(stored);
        }
      } else {
        this.status = 'unauthenticated';
        if (isRuntimeClient()) {
          broadcastSessionChange(null);
        }
      }
      this.initialised = true;
    },
    syncFromStorage() {
      this.initialiseFromStorage(true);
    },
    async login(credentials: LoginCredentials) {
      const requestFetch = getRequestFetch();
      try {
        const response = await requestFetch<SessionData & { error?: string }>('/api/auth/login', {
          method: 'POST',
          body: credentials,
        });
        if (!response || !response.token) {
          throw createError({
            statusCode: 500,
            statusMessage: response?.error || 'Invalid login response',
          });
        }
        this.setSession(response);
        return response;
      } catch (error) {
        this.clearSession();
        throw error;
      }
    },
    async logout({ redirectTo }: { redirectTo?: string } = {}) {
      const requestFetch = getRequestFetch();
      try {
        await requestFetch('/api/auth/logout', {
          method: 'POST',
        });
      } catch (error) {
        if (isRuntimeDev()) {
          // eslint-disable-next-line no-console
          console.warn('[session] Logout request failed', error);
        }
      } finally {
        this.clearSession();
        if (redirectTo && isRuntimeClient()) {
          window.location.assign(redirectTo);
        }
      }
    },
    async refresh() {
      const requestFetch = getRequestFetch();
      const currentAccessToken = this.bearerToken;
      const requestSession = async (token?: string | null) => {
        const headers =
          token && token.trim().length > 0
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined;
        return requestFetch<SessionData & { error?: string }>('/api/auth/session', {
          method: 'GET',
          headers,
        });
      };

      const parseResponse = (response: SessionData & { error?: string } | null) => {
        if (!response?.user) {
          throw createError({
            statusCode: 401,
            statusMessage: response?.error || 'Session expired',
          });
        }
        const tokenFromResponse = normaliseToken(response.token);
        const tokenToPersist = tokenFromResponse ?? currentAccessToken;
        const nextSession: SessionData = {
          ...response,
          token: tokenToPersist,
        };
        this.setSession(nextSession);
        return nextSession;
      };

      const accessToken = currentAccessToken;
      try {
        if (accessToken) {
          try {
            const response = await requestSession(accessToken);
            return parseResponse(response);
          } catch {
            // Fall through and try cookie-based session recovery.
          }
        }

        const cookieResponse = await requestSession(null);
        return parseResponse(cookieResponse);
      } catch (error) {
        if (isRuntimeDev()) {
          // eslint-disable-next-line no-console
          console.warn('[session] Failed to refresh session', error);
        }
        this.clearSession();
        return null;
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
}
