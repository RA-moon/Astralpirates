import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSearchInput from '~/components/ui/forms/SearchInput.vue';

describe('UiSearchInput', () => {
  it('renders search type and emits updates', async () => {
    const wrapper = mount(UiSearchInput, {
      props: { modelValue: '' },
    });
    expect(wrapper.find('input').attributes('type')).toBe('search');
    await wrapper.find('input').setValue('nova');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['nova']);
  });
});
