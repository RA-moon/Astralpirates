import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiRadioGroup from '~/components/ui/forms/RadioGroup.vue';

const options = [
  { label: 'Captain', value: 'captain' },
  { label: 'Navigator', value: 'navigator' },
];

describe('UiRadioGroup', () => {
  it('selects radio value', async () => {
    const wrapper = mount(UiRadioGroup, {
      props: { modelValue: 'captain', options },
    });

    await wrapper.findAll('input')[1].setValue();
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['navigator']);
  });
});
