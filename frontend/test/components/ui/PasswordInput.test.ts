import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiPasswordInput from '~/components/ui/forms/PasswordInput.vue';

describe('UiPasswordInput', () => {
  it('toggles visibility', async () => {
    const wrapper = mount(UiPasswordInput, {
      props: { modelValue: 'secret' },
      slots: {},
    });

    expect(wrapper.find('input').attributes('type')).toBe('password');
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('input').attributes('type')).toBe('text');
  });
});
