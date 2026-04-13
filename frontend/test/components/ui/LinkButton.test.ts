import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiLinkButton from '~/components/ui/actions/LinkButton.vue';

describe('UiLinkButton', () => {
  it('renders NuxtLink with variant', () => {
    const wrapper = mount(UiLinkButton, {
      props: { to: '/bridge', variant: 'secondary' },
      slots: { default: 'Bridge' },
      global: {
        components: {
          NuxtLink: {
            template: '<a :href="to"><slot /></a>',
            props: ['to'],
          },
        },
      },
    });

    expect(wrapper.classes()).toContain('ui-link-button--secondary');
    expect(wrapper.attributes('href')).toBe('/bridge');
  });
});
