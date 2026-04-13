import { describe, it, expect, vi } from 'vitest';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';

import PageShell from '~/components/PageShell.vue';
import type { PageDocument } from '~/modules/api/schemas';

vi.mock('#app', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('~/composables/usePageEditingPermissions', () => {
  const noop = async () => {};
  return {
    usePageEditingPermissions: () => ({
      canEdit: computed(() => false),
      isReady: computed(() => true),
      error: computed(() => null),
      refreshProfile: noop,
    }),
  };
});

vi.mock('~/composables/usePageEditorState', () => {
  const isOpen = ref(false);
  return {
    usePageEditorState: () => ({
      isOpen: computed(() => isOpen.value),
      draft: ref(null),
      original: ref(null),
      saving: ref(false),
      errorMessage: ref(null),
      hasChanges: computed(() => false),
      openEditor: vi.fn(),
      closeEditor: vi.fn(),
      resetDraft: vi.fn(),
      setSaving: vi.fn(),
      setError: vi.fn(),
    }),
  };
});

const stubNuxtLink = {
  template: '<a :href="to"><slot /></a>',
  props: ['to'],
};

const makePageData = (overrides: Partial<PageDocument> = {}): PageDocument => ({
  id: 'test-page',
  title: 'Test Page',
  path: 'bridge',
  summary: null,
  navigation: null,
  layout: [],
  ...overrides,
});

describe('PageShell', () => {
  it('hides fallback heading when hero block supplies title', () => {
    const wrapper = mount(PageShell, {
      props: {
        pagePath: '/bridge',
        pageData: makePageData({
          layout: [
            {
              blockType: 'hero',
              title: 'Hero Title',
              eyebrow: null,
              tagline: [],
              body: [],
              ctas: [],
            } as any,
          ],
        }),
      },
      global: {
        components: {
          NuxtLink: stubNuxtLink,
        },
        stubs: {
          PrivilegedControlsFlyout: true,
        },
      },
    });

    expect(wrapper.find('h1.animated-title').exists()).toBe(false);
  });

  it('renders configured outbound connections for bridge without parent fallback', () => {
    const wrapper = mount(PageShell, {
      props: {
        pagePath: '/bridge',
        pageData: makePageData({
          path: 'bridge',
          layout: [],
        }),
      },
      global: {
        components: {
          NuxtLink: stubNuxtLink,
        },
        stubs: {
          PrivilegedControlsFlyout: true,
        },
      },
    });

    const links = wrapper.findAll('.page-shell__connections a');
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/bridge/flight-plans',
      '/bridge/logbook',
      '/gangway',
    ]);
  });

  it('falls back to parent and sibling when node lacks outbound connectors', () => {
    const wrapper = mount(PageShell, {
      props: {
        pagePath: '/gangway/about/pirates',
        pageData: makePageData({
          path: 'gangway/about/pirates',
          layout: [],
        }),
      },
      global: {
        components: {
          NuxtLink: stubNuxtLink,
        },
        stubs: {
          PrivilegedControlsFlyout: true,
        },
      },
    });

    const hrefs = wrapper.findAll('.page-shell__connections a').map((link) => link.attributes('href'));
    expect(hrefs).toEqual(['/gangway/about']);
  });

  it('normalises navigation override hrefs to absolute paths', () => {
    const wrapper = mount(PageShell, {
      props: {
        pagePath: '/gangway',
        pageData: makePageData({ path: 'gangway', layout: [] }),
        navigationOverrides: {
          engineering: { href: 'gangway/engineering' },
        },
      },
      global: {
        components: {
          NuxtLink: stubNuxtLink,
        },
        stubs: {
          PrivilegedControlsFlyout: true,
        },
      },
    });

    const hrefs = wrapper.findAll('.page-shell__connections a').map((link) => link.attributes('href'));
    expect(hrefs).toContain('/gangway/engineering');
    expect(hrefs).not.toContain('gangway/engineering');
  });
});
