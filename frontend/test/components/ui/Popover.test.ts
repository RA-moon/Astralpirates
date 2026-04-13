import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiPopover from '~/components/ui/overlays/Popover.vue';

describe('UiPopover', () => {
  it('toggles content', async () => {
    const wrapper = mount(UiPopover, {
      slots: {
        trigger: '<button>Trigger</button>',
        default: '<p>Content</p>',
      },
    });

    await wrapper.find('button').trigger('click');
    expect(document.body.querySelector('.ui-popover__content')).toBeTruthy();
  });
});
