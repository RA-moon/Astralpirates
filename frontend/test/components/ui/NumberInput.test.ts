import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiNumberInput from '~/components/ui/forms/NumberInput.vue';

describe('UiNumberInput', () => {
  it('emits number changes as strings', async () => {
    const wrapper = mount(UiNumberInput, {
      props: { modelValue: '2' },
    });

    await wrapper.find('input').setValue('5');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['5']);
  });
});
