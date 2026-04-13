import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiStatCard from '~/components/ui/cards/StatCard.vue';

describe('UiStatCard', () => {
  it('renders label, value, and meta copy', () => {
    const wrapper = mount(UiStatCard, {
      props: {
        label: 'Crew on deck',
        value: 18,
        meta: '+3 vs yesterday',
      },
    });

    expect(wrapper.text()).toContain('Crew on deck');
    expect(wrapper.text()).toContain('18');
    expect(wrapper.text()).toContain('+3 vs yesterday');
  });

  it('hides meta paragraph when not provided', () => {
    const wrapper = mount(UiStatCard, {
      props: {
        label: 'Signals routed',
        value: '47',
      },
    });

    expect(wrapper.find('.ui-stat-card__meta').exists()).toBe(false);
  });
});
