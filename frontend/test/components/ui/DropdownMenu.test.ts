import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiDropdownMenu from '~/components/ui/menus/DropdownMenu.vue';

describe('UiDropdownMenu', () => {
  it('invokes action', async () => {
    const calls: string[] = [];
    const wrapper = mount(UiDropdownMenu, {
      props: {
        items: [{ label: 'Test', action: () => calls.push('run') }],
      },
      slots: {
        trigger: '<button>Open</button>',
      },
    });

    await wrapper.find('button').trigger('click');
    document.querySelector<HTMLButtonElement>('.ui-dropdown button')?.click();
    expect(calls).toEqual(['run']);
  });
});
