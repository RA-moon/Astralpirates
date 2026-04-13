import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AdminModeToggle from '~/components/AdminModeToggle.client.vue';
import { useAdminModeStore } from '~/stores/adminMode';
import { useSessionStore } from '~/stores/session';

const clearAdminModeCookies = () => {
  document.cookie = 'astral_admin_view=; Path=/; Max-Age=0';
  document.cookie = 'astral_admin_edit=; Path=/; Max-Age=0';
};

const setSessionRole = (role: string | null) => {
  const session = useSessionStore();
  if (!role) {
    session.markUnauthenticated();
    session.initialised = true;
    return session;
  }

  session.setSession({
    token: 'session-token',
    user: {
      id: 7,
      email: 'crew@astralpirates.com',
      role,
    },
  });
  return session;
};

beforeAll(() => {
  Object.assign(process, { client: true, server: false, dev: true });
});

beforeEach(() => {
  const pinia = createPinia();
  setActivePinia(pinia);
  clearAdminModeCookies();
  window.localStorage.clear();
});

describe('AdminModeToggle', () => {
  it('renders only for quartermaster+ users', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    setSessionRole('crew');

    const wrapper = mount(AdminModeToggle, {
      global: {
        plugins: [pinia],
      },
    });
    await nextTick();

    expect(wrapper.find('.admin-mode-toggle').exists()).toBe(false);
  });

  it('shows admin visibility control for quartermaster users', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    setSessionRole('quartermaster');
    const adminMode = useAdminModeStore();

    const wrapper = mount(AdminModeToggle, {
      global: {
        plugins: [pinia],
      },
    });
    await nextTick();

    expect(wrapper.find('.admin-mode-toggle').exists()).toBe(true);
    expect(wrapper.findAll('.ui-switch')).toHaveLength(1);
    expect(adminMode.adminViewEnabled).toBe(false);

    await wrapper.find('.ui-switch').trigger('click');
    expect(adminMode.adminViewEnabled).toBe(true);
    expect(adminMode.adminEditEnabled).toBe(false);
  });

  it('enforces view-before-edit dependency for captains', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    setSessionRole('captain');
    const adminMode = useAdminModeStore();

    const wrapper = mount(AdminModeToggle, {
      global: {
        plugins: [pinia],
      },
    });
    await nextTick();

    const initialSwitches = wrapper.findAll('.ui-switch');
    expect(initialSwitches).toHaveLength(2);
    expect(initialSwitches[1]?.attributes('disabled')).toBeDefined();

    await initialSwitches[0]?.trigger('click');
    await nextTick();
    expect(adminMode.adminViewEnabled).toBe(true);

    const enabledSwitches = wrapper.findAll('.ui-switch');
    expect(enabledSwitches[1]?.attributes('disabled')).toBeUndefined();
    await enabledSwitches[1]?.trigger('click');
    expect(adminMode.adminEditEnabled).toBe(true);

    await enabledSwitches[0]?.trigger('click');
    await nextTick();
    expect(adminMode.adminViewEnabled).toBe(false);
    expect(adminMode.adminEditEnabled).toBe(false);
  });
});
