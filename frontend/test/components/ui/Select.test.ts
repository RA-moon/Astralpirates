import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSelect from '~/components/ui/forms/Select.vue';

const options = [
  { label: 'Bridge', value: 'bridge' },
  { label: 'Gangway', value: 'gangway' },
];

describe('UiSelect', () => {
  it('renders options and emits selection', async () => {
    const wrapper = mount(UiSelect, {
      props: {
        modelValue: '',
        options,
        placeholder: 'Select area',
      },
    });

    await wrapper.find('select').setValue('bridge');
    expect(wrapper.emitted()['update:modelValue']?.[0]).toEqual(['bridge']);
  });
});
