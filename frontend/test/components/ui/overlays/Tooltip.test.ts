import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Tooltip from '~/components/ui/overlays/Tooltip.vue';

const mockRect = {
  top: 100,
  left: 50,
  width: 40,
  height: 20,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

describe('Tooltip', () => {
  it('shows bubble with computed position on hover', async () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'Hello' },
      slots: { default: 'Trigger' },
      attachTo: document.body,
    });

    const trigger = wrapper.get('.ui-tooltip__trigger');
    trigger.element.getBoundingClientRect = vi.fn(() => mockRect);

    await trigger.trigger('mouseenter');

    const bubble = document.body.querySelector('.ui-tooltip__bubble') as HTMLElement | null;
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain('Hello');
    expect(bubble?.style.top).toBe(`${mockRect.top}px`);
    expect(bubble?.style.left).toBe(`${mockRect.left + mockRect.width / 2}px`);

    await trigger.trigger('mouseleave');
    expect(document.body.querySelector('.ui-tooltip__bubble')).toBeNull();
    wrapper.unmount();
  });

  it('responds to focus/blur', async () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'Focused' },
      slots: { default: '<button>Focus me</button>' },
      attachTo: document.body,
    });

    const trigger = wrapper.get('.ui-tooltip__trigger');
    trigger.element.getBoundingClientRect = vi.fn(() => mockRect);

    await trigger.trigger('focus');
    expect(document.body.querySelector('.ui-tooltip__bubble')).not.toBeNull();

    await trigger.trigger('blur');
    expect(document.body.querySelector('.ui-tooltip__bubble')).toBeNull();
    wrapper.unmount();
  });
});
