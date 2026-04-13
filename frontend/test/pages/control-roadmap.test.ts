import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

import ControlRoadmapPage from '~/pages/gangway/engineering/control.vue';
import changelogSnapshot from '~/generated/changelog.json' with { type: 'json' };
import roadmapSnapshot from '~/generated/roadmap.json' with { type: 'json' };

vi.mock('~/composables/usePageContent', () => ({
  usePageContent: () => ({
    data: ref({ layout: [] }),
    error: ref(null),
  }),
}));

vi.mock('~/modules/api', async () => {
  const { ref } = await import('vue');
  return {
    useAstralFetch: () => ({
      data: ref(null),
      error: ref(null),
    }),
  };
});

describe('Control roadmap page', () => {
  it('renders the changelog releases and each roadmap tier', async () => {
    const SuspenseWrapper = {
      components: { ControlRoadmapPage },
      template: '<Suspense><ControlRoadmapPage /></Suspense>',
    };

    const wrapper = mount(SuspenseWrapper, {
      global: {
        stubs: {
          PageShell: { template: '<div><slot /></div>' },
          PageRenderer: { template: '<div />' },
          UiStack: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiHeading: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiInline: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiSurface: { template: '<div v-bind="$attrs"><slot /></div>' },
          UiBadge: { template: '<span><slot /></span>' },
          UiText: { template: '<p><slot /></p>' },
          UiAccordion: {
            props: ['items'],
            template: `
              <div class="accordion">
                <div v-for="item in items" :key="item.id" class="accordion-item">
                  <slot name="title" :item="item"></slot>
                  <slot name="item" :item="item"></slot>
                </div>
              </div>
            `,
          },
        },
      },
    });

    await flushPromises();
    expect(wrapper.findComponent(ControlRoadmapPage).exists()).toBe(true);

    const changelog = (changelogSnapshot as { releases: { title: string; entries: string[] }[] })
      .releases ?? [];
    expect(changelog.length).toBeGreaterThan(0);
    const tiers = (roadmapSnapshot as { tiers: { items: unknown[] }[] }).tiers ?? [];
    expect(tiers.length).toBeGreaterThan(0);
    const firstTimestamp = tiers
      .flatMap((tier) => tier.items)
      .map((item) => ((item as { plan?: { updatedAt?: string | null; lastUpdated?: string | null } }).plan ?? null))
      .map((plan) => plan?.updatedAt ?? plan?.lastUpdated ?? null)
      .find(Boolean);
    expect(firstTimestamp).toBeTruthy();
  });
});
