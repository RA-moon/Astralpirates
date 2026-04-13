import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import UiTableShell from '~/components/ui/table/TableShell.vue';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
];

const rows = [
  { id: '1', name: 'Nova', status: 'Online' },
];

describe('UiTableShell', () => {
  it('renders headers and rows for provided data', () => {
    const wrapper = mount(UiTableShell, {
      props: { columns, rows },
    });

    expect(wrapper.findAll('th')).toHaveLength(columns.length);
    expect(wrapper.findAll('tbody tr')).toHaveLength(rows.length);
    expect(wrapper.text()).toContain('Nova');
  });

  it('supports scoped cell slots', () => {
    const wrapper = mount(UiTableShell, {
      props: { columns, rows },
      slots: {
        'cell-status': ({ value }: { value: string }) => h('span', { class: 'status-cell' }, value.toUpperCase()),
      },
    });

    expect(wrapper.find('.status-cell').text()).toBe('ONLINE');
  });
});
