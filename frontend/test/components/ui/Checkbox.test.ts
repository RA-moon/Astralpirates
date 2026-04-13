import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiCheckbox from '~/components/ui/forms/Checkbox.vue';

describe('UiCheckbox', () => {
  it('toggles value', async () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false },
      slots: { default: 'Allow invites' },
    });

    await wrapper.find('input').setValue(true);
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual([true]);
  });
});
