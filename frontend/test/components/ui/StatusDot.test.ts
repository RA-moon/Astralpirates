import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiStatusDot from '~/components/ui/display/StatusDot.vue';

describe('UiStatusDot', () => {
  it('defaults to the neutral variant', () => {
    const wrapper = mount(UiStatusDot, {
      slots: { default: 'Unknown' },
    });

    expect(wrapper.classes()).toContain('ui-status-dot--default');
    expect(wrapper.text()).toContain('Unknown');
  });

  it('applies requested variant classes', () => {
    const wrapper = mount(UiStatusDot, {
      props: { variant: 'success' },
      slots: { default: 'Nominal' },
    });

    expect(wrapper.classes()).toContain('ui-status-dot--success');
  });
});
