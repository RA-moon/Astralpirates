import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiDrawer from '~/components/ui/overlays/Drawer.vue';

describe('UiDrawer', () => {
  it('closes on backdrop click', async () => {
    const wrapper = mount(UiDrawer, {
      props: { modelValue: true },
      slots: { default: 'Drawer body' },
    });
    document.querySelector<HTMLElement>('.ui-drawer')?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual([false]);
  });
});
