import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiModal from '~/components/ui/overlays/Modal.vue';

describe('UiModal', () => {
  it('emits close on backdrop', async () => {
    const wrapper = mount(UiModal, {
      props: { modelValue: true },
      slots: { default: 'Body' },
    });

    document.querySelector<HTMLElement>('.ui-modal')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(wrapper.emitted()['update:modelValue']).toBeTruthy();
  });
});
