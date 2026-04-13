import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSegmentedControl from '~/components/ui/forms/SegmentedControl.vue';

const options = [
  { label: 'Crew', value: 'crew' },
  { label: 'Public', value: 'public' },
];

describe('UiSegmentedControl', () => {
  it('selects option', async () => {
    const wrapper = mount(UiSegmentedControl, {
      props: { modelValue: 'crew', options },
    });

    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['public']);
  });
});
