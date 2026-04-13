import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiBadge from '~/components/ui/display/Badge.vue';

describe('UiBadge', () => {
  it('renders the provided numeric value and clamps above the max', () => {
    const wrapper = mount(UiBadge, {
      props: { value: 120, max: 99 },
    });

    expect(wrapper.text()).toBe('99+');
  });

  it('applies variant classes and exposes custom slot content', () => {
    const wrapper = mount(UiBadge, {
      props: { variant: 'success' },
      slots: { default: 'Nominal' },
    });

    expect(wrapper.classes()).toContain('ui-badge--success');
    expect(wrapper.text()).toBe('Nominal');
  });

  it('switches accessibility attributes when ariaLabel is provided', () => {
    const wrapper = mount(UiBadge, {
      props: { value: 3, ariaLabel: 'three pending invites' },
    });

    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-label')).toBe('three pending invites');
  });
});
