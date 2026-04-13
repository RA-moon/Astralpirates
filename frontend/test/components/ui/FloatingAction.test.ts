import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiFloatingAction from '~/components/ui/actions/FloatingAction.vue';

describe('UiFloatingAction', () => {
  it('renders with position class', () => {
    const wrapper = mount(UiFloatingAction, {
      props: { position: 'bottom-left' },
      slots: { default: 'Launch' },
    });
    expect(wrapper.classes()).toContain('ui-floating-action--bottom-left');
  });
});
