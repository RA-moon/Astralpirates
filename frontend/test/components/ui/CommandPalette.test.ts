import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiCommandPalette from '~/components/ui/overlays/CommandPalette.vue';

describe('UiCommandPalette', () => {
  it('executes command', async () => {
    const calls: string[] = [];
    mount(UiCommandPalette, {
      props: {
        modelValue: true,
        commands: [{ label: 'Bridge', action: () => calls.push('bridge') }],
      },
    });

    document.querySelector<HTMLButtonElement>('.ui-command-palette__list button')?.click();
    expect(calls).toEqual(['bridge']);
  });
});
