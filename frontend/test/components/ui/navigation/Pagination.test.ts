import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Pagination from '~/components/ui/navigation/Pagination.vue';

const factory = (current = 2, total = 3) =>
  mount(Pagination, {
    props: { current, total },
  });

describe('Pagination', () => {
  it('emits change for next/prev within bounds', async () => {
    const wrapper = factory();

    await wrapper.get('button:last-of-type').trigger('click');
    expect(wrapper.emitted().change?.[0]).toEqual([3]);

    await wrapper.get('button:first-of-type').trigger('click');
    expect(wrapper.emitted().change?.[1]).toEqual([1]);
  });

  it('disables buttons at boundaries and does not emit out-of-range', async () => {
    const wrapper = factory(1, 1);
    const [prev, next] = wrapper.findAll('button');
    expect(prev.attributes('disabled')).toBeDefined();
    expect(next.attributes('disabled')).toBeDefined();

    await prev.trigger('click');
    await next.trigger('click');
    expect(wrapper.emitted().change).toBeUndefined();
  });
});
