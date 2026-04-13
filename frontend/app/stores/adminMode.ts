import { acceptHMRUpdate, defineStore } from 'pinia';
import {
  parseAdminModeFlag,
  resolveEffectiveAdminMode,
  type EffectiveAdminMode,
} from '@astralpirates/shared/adminMode';
import { updateOwnAdminModePreferences } from '~/domains/profiles/api';
import { useSessionStore } from '~/stores/session';

const ADMIN_MODE_COOKIE_KEYS = Object.freeze({
  view: 'astral_admin_view',
  edit: 'astral_admin_edit',
});

type AdminModeState = {
  requestedAdminViewEnabled: boolean;
  requestedAdminEditEnabled: boolean;
  initialised: boolean;
};

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type LegacyProcess = {
  client?: boolean;
};

const getLegacyProcess = (): LegacyProcess | null => {
  if (typeof process === 'undefined') return null;
  return process as unknown as LegacyProcess;
};

const isRuntimeClient = (): boolean => import.meta.client || getLegacyProcess()?.client === true;

type AdminModePreferences = {
  adminViewEnabled: boolean;
  adminEditEnabled: boolean;
};

const readCookieValue = (cookieHeader: string, key: string): string | null => {
  const entries = cookieHeader.split(';');
  for (const entry of entries) {
    const [rawName, ...rawValueParts] = entry.trim().split('=');
    if (rawName !== key || rawValueParts.length === 0) {
      continue;
    }
    return rawValueParts.join('=');
  }
  return null;
};

const readAdminModeCookieFlags = (): { viewRequested: boolean; editRequested: boolean } => {
  if (!isRuntimeClient()) {
    return { viewRequested: false, editRequested: false };
  }

  const cookieHeader = document.cookie ?? '';
  return {
    viewRequested: parseAdminModeFlag(readCookieValue(cookieHeader, ADMIN_MODE_COOKIE_KEYS.view)),
    editRequested: parseAdminModeFlag(readCookieValue(cookieHeader, ADMIN_MODE_COOKIE_KEYS.edit)),
  };
};

const writeCookieFlag = (key: string, enabled: boolean) => {
  if (!isRuntimeClient()) return;

  if (enabled) {
    document.cookie = `${key}=1; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
    return;
  }

  document.cookie = `${key}=; Path=/; SameSite=Lax; Max-Age=0`;
};

const readSessionAdminModePreferences = (): AdminModePreferences | null => {
  const session = useSessionStore();
  const raw = session.currentUser?.adminModePreferences;
  if (!raw || typeof raw !== 'object') return null;
  return {
    adminViewEnabled: Boolean(raw.adminViewEnabled),
    adminEditEnabled: Boolean(raw.adminEditEnabled),
  };
};

export const useAdminModeStore = defineStore('admin-mode', {
  state: (): AdminModeState => ({
    requestedAdminViewEnabled: false,
    requestedAdminEditEnabled: false,
    initialised: false,
  }),
  getters: {
    effectiveMode: (state): EffectiveAdminMode => {
      const session = useSessionStore();
      return resolveEffectiveAdminMode({
        role: session.currentUser?.role ?? null,
        adminViewRequested: state.requestedAdminViewEnabled,
        adminEditRequested: state.requestedAdminEditEnabled,
      });
    },
    adminViewEnabled(): boolean {
      return this.effectiveMode.adminViewEnabled;
    },
    adminEditEnabled(): boolean {
      return this.effectiveMode.adminEditEnabled;
    },
    canUseAdminView(): boolean {
      return this.effectiveMode.eligibility.canUseAdminView;
    },
    canUseAdminEdit(): boolean {
      return this.effectiveMode.eligibility.canUseAdminEdit;
    },
    hasAnyAdminModeEnabled(): boolean {
      return this.adminViewEnabled || this.adminEditEnabled;
    },
  },
  actions: {
    persistRequestedFlags() {
      writeCookieFlag(ADMIN_MODE_COOKIE_KEYS.view, this.requestedAdminViewEnabled);
      writeCookieFlag(ADMIN_MODE_COOKIE_KEYS.edit, this.requestedAdminEditEnabled);
    },
    clampToEffectiveMode() {
      const next = this.effectiveMode;
      this.requestedAdminViewEnabled = next.adminViewEnabled;
      this.requestedAdminEditEnabled = next.adminEditEnabled;
      this.persistRequestedFlags();
    },
    async persistServerPreferences() {
      const session = useSessionStore();
      if (!session.isAuthenticated) return;

      try {
        const response = await updateOwnAdminModePreferences({
          adminViewEnabled: this.requestedAdminViewEnabled,
          adminEditEnabled: this.requestedAdminEditEnabled,
        });
        const persisted = response?.profile?.adminModePreferences;
        if (!persisted) return;
        this.requestedAdminViewEnabled = Boolean(persisted.adminViewEnabled);
        this.requestedAdminEditEnabled = Boolean(persisted.adminEditEnabled);
        this.clampToEffectiveMode();
        if (session.session) {
          session.setSession({
            ...session.session,
            user: {
              ...session.session.user,
              adminModePreferences: {
                adminViewEnabled: this.requestedAdminViewEnabled,
                adminEditEnabled: this.requestedAdminEditEnabled,
              },
            },
          });
        }
      } catch {
        // Best-effort persistence: local/admin cookies remain authoritative for the current tab.
      }
    },
    initialise() {
      const sessionPreferences = readSessionAdminModePreferences();
      if (sessionPreferences) {
        this.requestedAdminViewEnabled = sessionPreferences.adminViewEnabled;
        this.requestedAdminEditEnabled = sessionPreferences.adminEditEnabled;
      } else {
        const { viewRequested, editRequested } = readAdminModeCookieFlags();
        this.requestedAdminViewEnabled = viewRequested;
        this.requestedAdminEditEnabled = editRequested;
      }
      this.initialised = true;
      this.clampToEffectiveMode();
    },
    setAdminViewEnabled(value: boolean) {
      this.requestedAdminViewEnabled = value;
      if (!value) {
        this.requestedAdminEditEnabled = false;
      }
      this.clampToEffectiveMode();
      void this.persistServerPreferences();
    },
    setAdminEditEnabled(value: boolean) {
      this.requestedAdminEditEnabled = value;
      this.clampToEffectiveMode();
      void this.persistServerPreferences();
    },
    reset() {
      this.requestedAdminViewEnabled = false;
      this.requestedAdminEditEnabled = false;
      this.persistRequestedFlags();
    },
    syncWithSession() {
      const session = useSessionStore();
      if (!session.initialised) return;
      if (!session.isAuthenticated) {
        this.reset();
        return;
      }
      const sessionPreferences = readSessionAdminModePreferences();
      if (sessionPreferences) {
        this.requestedAdminViewEnabled = sessionPreferences.adminViewEnabled;
        this.requestedAdminEditEnabled = sessionPreferences.adminEditEnabled;
      }
      this.clampToEffectiveMode();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAdminModeStore, import.meta.hot));
}
