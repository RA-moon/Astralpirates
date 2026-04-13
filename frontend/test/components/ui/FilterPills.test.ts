import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiFilterPills from '~/components/ui/navigation/FilterPills.vue';

const buildPills = () => [
  { label: 'All crew', value: 'all', badge: 12 },
  { label: 'Captains', value: 'captain', badge: 2 },
];

describe('UiFilterPills', () => {
  it('emits updates when a pill is clicked', async () => {
    const wrapper = mount(UiFilterPills, {
      props: {
        pills: buildPills(),
        modelValue: 'all',
      },
    });

    const buttons = wrapper.findAll('button');
    await buttons[1].trigger('click');

    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['captain']);
  });

  it('renders badges when a badge value is provided', () => {
    const wrapper = mount(UiFilterPills, {
      props: {
        pills: buildPills(),
        modelValue: 'all',
      },
    });

    expect(wrapper.findAll('.ui-filter-pill__badge').length).toBeGreaterThan(0);
  });
});
