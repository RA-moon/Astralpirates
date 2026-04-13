import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiTextArea from '~/components/ui/forms/TextArea.vue';

describe('UiTextArea', () => {
  it('emits v-model updates', async () => {
    const wrapper = mount(UiTextArea, {
      props: { modelValue: 'hello' },
    });
    await wrapper.find('textarea').setValue('updated');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['updated']);
  });

  it('applies disabled state', () => {
    const wrapper = mount(UiTextArea, {
      props: { disabled: true },
    });
    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined();
  });
});
