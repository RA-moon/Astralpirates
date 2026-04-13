import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSwitch from '~/components/ui/forms/Switch.vue';

describe('UiSwitch', () => {
  it('toggles state', async () => {
    const wrapper = mount(UiSwitch, {
      props: { modelValue: false },
      slots: { default: 'Allow comments' },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual([true]);
  });
});
