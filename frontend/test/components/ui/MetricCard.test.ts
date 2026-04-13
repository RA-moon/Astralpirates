import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiMetricCard from '~/components/ui/cards/MetricCard.vue';

describe('UiMetricCard', () => {
  it('renders trend text with variant class', () => {
    const wrapper = mount(UiMetricCard, {
      props: {
        label: 'Signal uptime',
        value: '99.98%',
        trend: { type: 'down', text: '-0.02% vs last week' },
      },
    });

    const trend = wrapper.find('.ui-metric-card__trend');
    expect(trend.text()).toContain('-0.02%');
    expect(trend.classes()).toContain('ui-metric-card__trend--down');
  });

  it('renders icon slot content', () => {
    const wrapper = mount(UiMetricCard, {
      props: {
        label: 'Hangar readiness',
        value: '87%',
      },
      slots: {
        icon: '<span class="metric-icon">icon</span>',
      },
    });

    expect(wrapper.find('.metric-icon').exists()).toBe(true);
  });
});
