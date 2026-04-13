import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiTableToolbar from '~/components/ui/table/TableToolbar.vue';

describe('UiTableToolbar', () => {
  it('renders filter and action slots', () => {
    const wrapper = mount(UiTableToolbar, {
      slots: {
        filters: '<button type="button">Filter</button>',
        actions: '<button type="button">Export</button>',
      },
    });

    expect(wrapper.find('.ui-table-toolbar__filters button').text()).toBe('Filter');
    expect(wrapper.find('.ui-table-toolbar__actions button').text()).toBe('Export');
  });
});
