import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAdminModeStore } from '~/stores/adminMode';
import { useSessionStore } from '~/stores/session';

const updateOwnAdminModePreferencesMock = vi.fn();

vi.mock('~/domains/profiles/api', () => ({
  updateOwnAdminModePreferences: (...args: unknown[]) =>
    updateOwnAdminModePreferencesMock(...args),
}));

const clearAdminModeCookies = () => {
  document.cookie = 'astral_admin_view=; Path=/; Max-Age=0';
  document.cookie = 'astral_admin_edit=; Path=/; Max-Age=0';
};

const readCookieValue = (key: string): string | null => {
  const cookieHeader = document.cookie ?? '';
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

const setSessionRole = (
  role: string,
  adminModePreferences?: {
    adminViewEnabled: boolean;
    adminEditEnabled: boolean;
  } | null,
) => {
  const session = useSessionStore();
  session.setSession({
    token: 'session-token',
    user: {
      id: 42,
      email: 'crew@astralpirates.com',
      role,
      adminModePreferences,
    },
  });
  return session;
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeAll(() => {
  Object.assign(process, { client: true, server: false, dev: true });
});

beforeEach(() => {
  setActivePinia(createPinia());
  clearAdminModeCookies();
  window.localStorage.clear();
  updateOwnAdminModePreferencesMock.mockReset();
  updateOwnAdminModePreferencesMock.mockResolvedValue({
    profile: {
      adminModePreferences: {
        adminViewEnabled: true,
        adminEditEnabled: false,
      },
    },
  });
});

describe('useAdminModeStore', () => {
  it('defaults to disabled admin modes', () => {
    setSessionRole('quartermaster');
    const store = useAdminModeStore();

    store.initialise();

    expect(store.adminViewEnabled).toBe(false);
    expect(store.adminEditEnabled).toBe(false);
    expect(store.canUseAdminView).toBe(true);
    expect(store.canUseAdminEdit).toBe(false);
  });

  it('hydrates from cookies and clamps edit mode for non-captains', () => {
    document.cookie = 'astral_admin_view=1; Path=/';
    document.cookie = 'astral_admin_edit=1; Path=/';
    setSessionRole('quartermaster');
    const store = useAdminModeStore();

    store.initialise();

    expect(store.adminViewEnabled).toBe(true);
    expect(store.adminEditEnabled).toBe(false);
    expect(readCookieValue('astral_admin_view')).toBe('1');
    expect(readCookieValue('astral_admin_edit') ?? '').toBe('');
  });

  it('hydrates from session preferences when available', () => {
    setSessionRole('captain', {
      adminViewEnabled: true,
      adminEditEnabled: true,
    });
    const store = useAdminModeStore();

    store.initialise();

    expect(store.adminViewEnabled).toBe(true);
    expect(store.adminEditEnabled).toBe(true);
  });

  it('enforces edit dependency on admin view', () => {
    setSessionRole('captain');
    const store = useAdminModeStore();
    store.initialise();

    store.setAdminEditEnabled(true);
    expect(store.adminViewEnabled).toBe(false);
    expect(store.adminEditEnabled).toBe(false);

    store.setAdminViewEnabled(true);
    store.setAdminEditEnabled(true);

    expect(store.adminViewEnabled).toBe(true);
    expect(store.adminEditEnabled).toBe(true);
    expect(readCookieValue('astral_admin_view')).toBe('1');
    expect(readCookieValue('astral_admin_edit')).toBe('1');
  });

  it('persists preference updates to the server for authenticated users', async () => {
    setSessionRole('quartermaster', {
      adminViewEnabled: false,
      adminEditEnabled: false,
    });
    const store = useAdminModeStore();
    store.initialise();

    store.setAdminViewEnabled(true);
    await flushPromises();

    expect(updateOwnAdminModePreferencesMock).toHaveBeenCalledWith({
      adminViewEnabled: true,
      adminEditEnabled: false,
    });
  });

  it('clears enabled flags after logout', () => {
    const session = setSessionRole('captain');
    const store = useAdminModeStore();
    store.initialise();
    store.setAdminViewEnabled(true);
    store.setAdminEditEnabled(true);

    session.clearSession();
    store.syncWithSession();

    expect(store.adminViewEnabled).toBe(false);
    expect(store.adminEditEnabled).toBe(false);
    expect(readCookieValue('astral_admin_view') ?? '').toBe('');
    expect(readCookieValue('astral_admin_edit') ?? '').toBe('');
  });

  it('removes edit mode when role drops below captain', () => {
    setSessionRole('captain');
    const session = useSessionStore();
    const store = useAdminModeStore();
    store.initialise();
    store.setAdminViewEnabled(true);
    store.setAdminEditEnabled(true);

    session.setSession({
      token: 'session-token-2',
      user: {
        id: 42,
        email: 'crew@astralpirates.com',
        role: 'quartermaster',
      },
    });
    store.syncWithSession();

    expect(store.adminViewEnabled).toBe(true);
    expect(store.adminEditEnabled).toBe(false);
  });
});
