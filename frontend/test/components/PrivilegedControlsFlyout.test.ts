import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { computed, nextTick, ref } from 'vue';
import PrivilegedControlsFlyout from '~/components/PrivilegedControlsFlyout.client.vue';
import { useAdminModeStore } from '~/stores/adminMode';
import { useSessionStore } from '~/stores/session';

const canEditRef = ref(false);
const isReadyRef = ref(true);
const refreshProfileMock = vi.fn(async () => {});
const openEditorMock = vi.fn();

vi.mock('~/composables/usePageEditingPermissions', () => ({
  usePageEditingPermissions: () => ({
    canEdit: computed(() => canEditRef.value),
    isReady: computed(() => isReadyRef.value),
    error: computed(() => null),
    refreshProfile: refreshProfileMock,
  }),
}));

vi.mock('~/composables/usePageEditorState', () => ({
  usePageEditorState: () => ({
    isOpen: computed(() => false),
    draft: ref(null),
    original: ref(null),
    saving: ref(false),
    errorMessage: ref(null),
    hasChanges: computed(() => false),
    openEditor: openEditorMock,
    closeEditor: vi.fn(),
    resetDraft: vi.fn(),
    setSaving: vi.fn(),
    setError: vi.fn(),
  }),
}));

const clearAdminModeCookies = () => {
  document.cookie = 'astral_admin_view=; Path=/; Max-Age=0';
  document.cookie = 'astral_admin_edit=; Path=/; Max-Age=0';
};

const setSessionRole = (role: string | null) => {
  const session = useSessionStore();
  if (!role) {
    session.markUnauthenticated();
    session.initialised = true;
    return;
  }

  session.setSession({
    token: 'session-token',
    user: {
      id: 7,
      email: 'crew@astralpirates.com',
      role,
    },
  });
};

const pageData = {
  id: 'test-page',
  title: 'Test Page',
  path: 'bridge',
  summary: null,
  navigation: null,
  layout: [],
};

beforeAll(() => {
  Object.assign(process, { client: true, server: false, dev: true });
});

beforeEach(() => {
  const pinia = createPinia();
  setActivePinia(pinia);
  clearAdminModeCookies();
  canEditRef.value = false;
  isReadyRef.value = true;
  openEditorMock.mockReset();
});

describe('PrivilegedControlsFlyout', () => {
  it('does not render when the user has no eligible privileged controls', async () => {
    setSessionRole('crew');
    const wrapper = mount(PrivilegedControlsFlyout, {
      props: { pageData: null },
    });
    await nextTick();
    expect(wrapper.find('.privileged-controls-flyout').exists()).toBe(false);
  });

  it('renders admin visibility control for quartermaster users only', async () => {
    setSessionRole('quartermaster');
    const adminMode = useAdminModeStore();
    const wrapper = mount(PrivilegedControlsFlyout, {
      props: { pageData: null },
    });
    await nextTick();

    expect(wrapper.find('.privileged-controls-flyout').exists()).toBe(true);
    expect(wrapper.find('#privileged-controls-flyout-panel').exists()).toBe(false);

    await wrapper.find('.privileged-controls-flyout__trigger').trigger('click');
    await nextTick();
    expect(wrapper.findAll('.ui-switch')).toHaveLength(1);

    await wrapper.find('.ui-switch').trigger('click');
    expect(adminMode.adminViewEnabled).toBe(true);
    expect(adminMode.adminEditEnabled).toBe(false);
  });

  it('enforces admin view dependency for captain edit control', async () => {
    setSessionRole('captain');
    const adminMode = useAdminModeStore();
    const wrapper = mount(PrivilegedControlsFlyout, {
      props: { pageData: null },
    });
    await nextTick();

    await wrapper.find('.privileged-controls-flyout__trigger').trigger('click');
    await nextTick();
    const switches = wrapper.findAll('.ui-switch');
    expect(switches).toHaveLength(2);
    expect(switches[1]?.attributes('disabled')).toBeDefined();

    await switches[0]?.trigger('click');
    await nextTick();
    expect(adminMode.adminViewEnabled).toBe(true);

    const enabledSwitches = wrapper.findAll('.ui-switch');
    expect(enabledSwitches[1]?.attributes('disabled')).toBeUndefined();
    await enabledSwitches[1]?.trigger('click');
    expect(adminMode.adminEditEnabled).toBe(true);
  });

  it('shows page edit control and opens editor when page edit is allowed', async () => {
    setSessionRole('crew');
    canEditRef.value = true;
    const wrapper = mount(PrivilegedControlsFlyout, {
      props: { pageData },
    });
    await nextTick();

    expect(wrapper.find('.privileged-controls-flyout').exists()).toBe(true);
    await wrapper.find('.privileged-controls-flyout__trigger').trigger('click');
    await nextTick();

    const pageEditButton = wrapper.find('.privileged-controls-flyout__page-edit');
    expect(pageEditButton.exists()).toBe(true);
    await pageEditButton.trigger('click');
    expect(openEditorMock).toHaveBeenCalledOnce();
  });

  it('requires captain admin edit mode before showing static page editing controls', async () => {
    setSessionRole('captain');
    canEditRef.value = true;
    const wrapper = mount(PrivilegedControlsFlyout, {
      props: { pageData },
    });
    await nextTick();

    await wrapper.find('.privileged-controls-flyout__trigger').trigger('click');
    await nextTick();
    expect(wrapper.find('.privileged-controls-flyout__page-edit').exists()).toBe(false);
    expect(wrapper.text()).toContain('Enable admin edit to unlock static-page editing in god mode.');

    const switches = wrapper.findAll('.ui-switch');
    await switches[0]?.trigger('click');
    await nextTick();

    const enabledSwitches = wrapper.findAll('.ui-switch');
    await enabledSwitches[1]?.trigger('click');
    await nextTick();

    const pageEditButton = wrapper.find('.privileged-controls-flyout__page-edit');
    expect(pageEditButton.exists()).toBe(true);
    await pageEditButton.trigger('click');
    expect(openEditorMock).toHaveBeenCalledOnce();
  });

  it('renders when only extra role-scoped controls are provided', async () => {
    setSessionRole('crew');
    const wrapper = mount(PrivilegedControlsFlyout, {
      props: { pageData: null, hasExtraControls: true },
      slots: {
        'extra-actions': '<button class="mission-edit-control">Edit mission</button>',
      },
    });
    await nextTick();

    expect(wrapper.find('.privileged-controls-flyout').exists()).toBe(true);
    await wrapper.find('.privileged-controls-flyout__trigger').trigger('click');
    await nextTick();
    expect(wrapper.find('.mission-edit-control').exists()).toBe(true);
  });
});
