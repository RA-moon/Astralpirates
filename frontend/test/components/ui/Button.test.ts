import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiButton from '~/components/ui/actions/Button.vue';

describe('UiButton', () => {
  it('renders content and variant class', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'secondary' },
      slots: { default: 'Launch' },
    });
    expect(wrapper.classes()).toContain('ui-button--secondary');
    expect(wrapper.text()).toBe('Launch');
  });

  it('disables when loading', () => {
    const wrapper = mount(UiButton, {
      props: { loading: true },
    });
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('emits click events', async () => {
    const wrapper = mount(UiButton, {
      slots: { default: 'Launch' },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});
