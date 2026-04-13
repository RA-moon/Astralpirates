import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import UiFormField from '~/components/ui/forms/FormField.vue';
import UiTextInput from '~/components/ui/forms/TextInput.vue';

const mountField = (props = {}) =>
  mount(UiFormField, {
    props: {
      label: 'Call sign',
      description: 'Used as slug',
      message: 'Required',
      ...props,
    },
    slots: {
      default: ({ id, describedBy }: { id: string; describedBy: string }) =>
        h(UiTextInput, { id, describedBy, modelValue: '' }),
    },
  });

describe('UiFormField', () => {
  it('renders label, description, and message', () => {
    const wrapper = mountField();
    expect(wrapper.find('.ui-form-field__label').text()).toContain('Call sign');
    expect(wrapper.find('.ui-form-field__description').text()).toBe('Used as slug');
    expect(wrapper.find('.ui-form-field__message').text()).toBe('Required');
  });

  it('exposes ids to child slots', () => {
    const wrapper = mount(UiFormField, {
      props: { label: 'Test' },
      slots: {
        default: ({ id, describedBy }: { id: string; describedBy?: string }) =>
          h('input', { id, 'aria-describedby': describedBy }),
      },
    });

    const input = wrapper.find('input');
    expect(input.attributes('id')).toMatch(/ui-field/);
  });
});
