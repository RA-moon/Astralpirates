import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

import StatusPage from '~/pages/status.vue';

const statusPayload = ref({
  ok: true,
  state: 'healthy' as const,
  generatedAt: '2026-04-01T12:00:00.000Z',
  components: [
    {
      id: 'cms' as const,
      label: 'CMS health',
      state: 'healthy' as const,
      summary: 'Pages and profiles health probes are passing.',
      checkedAt: '2026-04-01T12:00:00.000Z',
      details: {
        pagesHealth: true,
      },
    },
    {
      id: 'backups' as const,
      label: 'Backups',
      state: 'healthy' as const,
      summary: 'Latest backup signal is fresh.',
      checkedAt: '2026-04-01T12:00:00.000Z',
      details: {
        source: 'manifest',
      },
    },
    {
      id: 'deploy' as const,
      label: 'Deploy log',
      state: 'healthy' as const,
      summary: 'Latest deploy recorded at 2026-04-01T12:00:00.000Z.',
      checkedAt: '2026-04-01T12:00:00.000Z',
      details: {
        sha: 'b977bcb7',
      },
    },
  ],
});

const pending = ref(false);
const error = ref(null);

vi.mock('~/modules/api', () => ({
  useAstralFetch: () => ({
    data: statusPayload,
    pending,
    error,
  }),
}));

describe('Status page', () => {
  it('renders status cards and contact CTA', async () => {
    const SuspenseWrapper = {
      components: { StatusPage },
      template: '<Suspense><StatusPage /></Suspense>',
    };

    const wrapper = mount(SuspenseWrapper, {
      global: {
        stubs: {
          PageShell: { template: '<div><slot /></div>' },
          UiStack: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiHeading: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiText: { template: '<p v-bind="$attrs"><slot /></p>' },
          UiInline: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiSurface: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiStatusDot: { template: '<span v-bind="$attrs"><slot /></span>' },
          UiAlert: { template: '<div v-bind="$attrs"><slot /></div>' },
          NuxtLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
        },
      },
    });

    await flushPromises();
    expect(wrapper.findComponent(StatusPage).exists()).toBe(true);
    expect(wrapper.text()).toContain('Ship status monitor');
    expect(wrapper.findAll('.ship-status__card')).toHaveLength(3);
    expect(wrapper.text()).toContain('CMS health');
    expect(wrapper.text()).toContain('Backups');
    expect(wrapper.text()).toContain('Deploy log');
    expect(wrapper.text()).toContain('Healthy');
    const contactLink = wrapper.find('a[href="/gangway/about/contact"]');
    expect(contactLink.exists()).toBe(true);
  });
});
