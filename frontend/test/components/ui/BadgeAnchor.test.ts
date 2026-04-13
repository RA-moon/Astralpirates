import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiBadgeAnchor from '~/components/ui/display/BadgeAnchor.vue';

const mountWithSlot = (options = {}) =>
  mount(UiBadgeAnchor, {
    slots: {
      default: '<span class="target">🛰️</span>',
      ...options.slots,
    },
    ...options,
  });

describe('UiBadgeAnchor', () => {
  it('hides badge when value is zero and showZero is false', () => {
    const wrapper = mountWithSlot({
      props: { value: 0, showZero: false },
    });

    expect(wrapper.find('.ui-badge-anchor__badge').exists()).toBe(false);
  });

  it('renders badge when value is present', () => {
    const wrapper = mountWithSlot({
      props: { value: 4 },
    });

    expect(wrapper.find('.ui-badge-anchor__badge').exists()).toBe(true);
    expect(wrapper.text()).toContain('4');
  });

  it('supports custom badge slot content', () => {
    const wrapper = mountWithSlot({
      props: { value: null },
      slots: {
        badge: '<span class="custom-dot"></span>',
      },
    });

    expect(wrapper.find('.custom-dot').exists()).toBe(true);
  });

  it('applies positional styles for bottom-start anchors', () => {
    const wrapper = mountWithSlot({
      props: {
        value: 2,
        position: 'bottom-start',
        offset: '0.25rem',
      },
    });

    const badge = wrapper.get('.ui-badge-anchor__badge');
    const style = badge.attributes('style');
    expect(style).toContain('bottom: 0.25rem');
    expect(style).toContain('left: 0.25rem');
  });
});
