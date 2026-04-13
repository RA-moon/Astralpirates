import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import ModalDemo from '~/components/ui/demo/overlays/ModalDemo.vue';

const stubbedTeleport = {
  template: '<div><slot /></div>',
};

describe('ModalDemo', () => {
  const factory = () =>
    mount(ModalDemo, {
      attachTo: document.body,
      global: {
        stubs: {
          // Avoid real teleports during unit tests
          teleport: stubbedTeleport,
        },
      },
    });

  const clickByText = async (wrapper: ReturnType<typeof factory>, text: string) => {
    const btn = wrapper.findAll('button').find((node) => node.text() === text);
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    await nextTick();
  };

  it('opens and closes modal, drawer, and command palette', async () => {
    const wrapper = factory();

    await clickByText(wrapper, 'Open modal');
    expect(wrapper.find('.ui-modal').exists()).toBe(true);

    await clickByText(wrapper, 'Close');
    expect(wrapper.find('.ui-modal').exists()).toBe(false);

    await clickByText(wrapper, 'Open drawer');
    expect(wrapper.find('.ui-drawer').exists()).toBe(true);

    await clickByText(wrapper, 'Command palette');
    expect(wrapper.find('.ui-command-palette').exists()).toBe(true);
  });
});
