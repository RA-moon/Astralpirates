import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';

import ElsaBalancePill from '~/components/auth/ElsaBalancePill.vue';
import { mockedRoute } from '../mocks/nuxt-imports';

const elsaBalance = ref(0);
const status = ref<'hidden' | 'loading' | 'error' | 'ready'>('ready');
const hydrateStatus = vi.fn();

const sessionStore = reactive({
  initialised: true,
  isAuthenticated: true,
  initialiseFromStorage: vi.fn(),
});

vi.mock('~/composables/useInviteStatus', () => ({
  useInviteStatus: () => ({
    elsaBalance,
    status,
    hydrateStatus,
  }),
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionStore,
}));

const stubNuxtLink = { template: '<a><slot /></a>' };

describe('ElsaBalancePill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hydrateStatus.mockReset();
    hydrateStatus.mockResolvedValue({ ok: true });
    elsaBalance.value = 42;
    status.value = 'ready';
    sessionStore.initialised = true;
    sessionStore.isAuthenticated = true;
    sessionStore.initialiseFromStorage.mockClear();
    mockedRoute.fullPath = '/';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders balance for authenticated users and hydrates on mount', async () => {
    const wrapper = mount(ElsaBalancePill, {
      global: { stubs: { NuxtLink: stubNuxtLink } },
    });

    await flushPromises();

    expect(wrapper.get('.elsa-pill__value').text()).toBe('42');
    expect(hydrateStatus).toHaveBeenCalled();
    expect(hydrateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, silent: false, retry: 1 }),
    );

    wrapper.unmount();
  });

  it('hides completely for guests', async () => {
    sessionStore.isAuthenticated = false;

    const wrapper = mount(ElsaBalancePill, {
      global: { stubs: { NuxtLink: stubNuxtLink } },
    });
    await flushPromises();

    expect(wrapper.find('.elsa-pill').exists()).toBe(false);
    expect(hydrateStatus).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('re-hydrates when the route changes', async () => {
    const wrapper = mount(ElsaBalancePill, {
      global: { stubs: { NuxtLink: stubNuxtLink } },
    });
    await flushPromises();
    hydrateStatus.mockClear();

    mockedRoute.fullPath = '/gangway';
    await nextTick();
    await flushPromises();

    expect(hydrateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true, retry: 1 }),
    );

    wrapper.unmount();
  });

  it('shows retry control on error and retries when clicked', async () => {
    status.value = 'error';

    const wrapper = mount(ElsaBalancePill, {
      global: { stubs: { NuxtLink: stubNuxtLink } },
    });
    await flushPromises();

    const retry = wrapper.get('.elsa-pill__retry');
    hydrateStatus.mockClear();
    await retry.trigger('click');
    await flushPromises();

    expect(hydrateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, silent: false, retry: 1 }),
    );

    wrapper.unmount();
  });
});
