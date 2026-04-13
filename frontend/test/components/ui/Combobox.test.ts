import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiCombobox from '~/components/ui/forms/Combobox.vue';

const items = [
  { label: 'Nova', value: 'nova' },
  { label: 'Vector', value: 'vector' },
];

describe('UiCombobox', () => {
  it('filters and selects items', async () => {
    const wrapper = mount(UiCombobox, {
      props: { items, modelValue: '' },
    });

    await wrapper.find('input').setValue('nov');
    await wrapper.find('input').trigger('focus');
    await wrapper.find('.ui-combobox__option').trigger('mousedown');

    expect(wrapper.emitted()['update:modelValue']?.[1]).toEqual(['Nova']);
  });
});
