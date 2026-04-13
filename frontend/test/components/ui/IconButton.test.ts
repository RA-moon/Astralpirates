import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiIconButton from '~/components/ui/actions/IconButton.vue';

describe('UiIconButton', () => {
  it('renders with variant', () => {
    const wrapper = mount(UiIconButton, {
      props: { variant: 'ghost' },
      slots: { default: '⚙' },
    });
    expect(wrapper.classes()).toContain('ui-icon-button--ghost');
  });
});
