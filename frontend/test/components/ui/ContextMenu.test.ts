import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiContextMenu from '~/components/ui/menus/ContextMenu.vue';

describe('UiContextMenu', () => {
  it('shows on right click and runs action', async () => {
    const calls: string[] = [];
    const wrapper = mount(UiContextMenu, {
      props: {
        items: [{ label: 'Edit', action: () => calls.push('edit') }],
      },
      slots: {
        default: '<div class="target">Right click</div>',
      },
    });

    await wrapper.find('.target').trigger('contextmenu');
    document.querySelector<HTMLButtonElement>('.ui-context__menu button')?.click();
    expect(calls).toEqual(['edit']);
  });

  it('ignores non-left global clicks while menu is open', async () => {
    const wrapper = mount(UiContextMenu, {
      props: {
        items: [{ label: 'Inspect', action: () => {} }],
      },
      slots: {
        default: '<div class="target">Context target</div>',
      },
    });

    await wrapper.find('.target').trigger('contextmenu');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.ui-context__menu')).not.toBeNull();

    window.dispatchEvent(new MouseEvent('click', { button: 2 }));
    expect(document.querySelector('.ui-context__menu')).not.toBeNull();

    window.dispatchEvent(new MouseEvent('click', { button: 0 }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.ui-context__menu')).toBeNull();
  });

  it('opens via fallback button when enabled', async () => {
    const calls: string[] = [];
    const wrapper = mount(UiContextMenu, {
      props: {
        showFallbackButton: true,
        fallbackLabel: 'Open menu',
        items: [{ label: 'Archive', action: () => calls.push('archive') }],
      },
      slots: {
        default: '<div class="target">Context target</div>',
      },
    });

    await wrapper.find('.ui-context__fallback').trigger('click');
    document.querySelector<HTMLButtonElement>('.ui-context__menu button')?.click();
    expect(calls).toEqual(['archive']);
  });

  it('opens via keyboard activation', async () => {
    const wrapper = mount(UiContextMenu, {
      props: {
        items: [{ label: 'Inspect', action: () => {} }],
      },
      slots: {
        default: '<div class="target">Keyboard target</div>',
      },
    });

    const surface = wrapper.find('.ui-context__surface');
    await surface.trigger('keydown', { key: 'ContextMenu' });
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.ui-context__menu')).not.toBeNull();
  });
});
