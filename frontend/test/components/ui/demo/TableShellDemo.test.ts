import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import TableShellDemo from '~/components/ui/demo/data/TableShellDemo.vue';

describe('TableShellDemo', () => {
  const factory = () =>
    mount(TableShellDemo, {
      attachTo: document.body,
    });

  const rowCount = (wrapper: ReturnType<typeof factory>) => wrapper.findAll('tbody tr').length;

  const clickButton = async (wrapper: ReturnType<typeof factory>, label: string) => {
    const btn = wrapper.findAll('button').find((node) => node.text() === label);
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    await nextTick();
  };

  it('filters rows and updates counts', async () => {
    const wrapper = factory();

    expect(rowCount(wrapper)).toBe(4);

    await clickButton(wrapper, 'Offline');
    expect(rowCount(wrapper)).toBe(1);
  });

  it('records export actions using the current filter', async () => {
    const wrapper = factory();

    await clickButton(wrapper, 'Offline');
    await clickButton(wrapper, 'Export roster');

    const lastActionText = wrapper.find('strong').text();
    expect(lastActionText).toContain('Exported 1 crew');
  });
});
