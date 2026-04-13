import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiTextInput from '~/components/ui/forms/TextInput.vue';

describe('UiTextInput', () => {
  it('emits v-model updates', async () => {
    const wrapper = mount(UiTextInput, {
      props: { modelValue: '' },
    });

    await wrapper.find('input').setValue('Nova');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['Nova']);
  });

  it('respects disabled state', () => {
    const wrapper = mount(UiTextInput, {
      props: { disabled: true },
    });
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });
});
