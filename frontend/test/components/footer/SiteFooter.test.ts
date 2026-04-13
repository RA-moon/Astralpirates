import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import SiteFooter from '~/components/footer/SiteFooter.vue';

describe('SiteFooter', () => {
  it('renders a low-key link to the public ship status page', () => {
    const wrapper = mount(SiteFooter, {
      global: {
        stubs: {
          NuxtLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
        },
      },
    });

    const statusLink = wrapper.find('a[href="/status"]');
    expect(statusLink.exists()).toBe(true);
    expect(statusLink.text()).toContain('Ship status');
  });
});
