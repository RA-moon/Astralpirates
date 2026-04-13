import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiEmptyState from '~/components/ui/feedback/EmptyState.vue';

describe('UiEmptyState', () => {
  it('renders title and description', () => {
    const wrapper = mount(UiEmptyState, {
      props: {
        title: 'No signals',
        description: 'Log a new broadcast to populate this feed.',
      },
    });

    expect(wrapper.text()).toContain('No signals');
    expect(wrapper.text()).toContain('Log a new broadcast');
  });

  it('renders action slot content', () => {
    const wrapper = mount(UiEmptyState, {
      props: {
        title: 'No entries',
        description: 'Add something new.',
      },
      slots: {
        actions: '<button class="primary">Add entry</button>',
      },
    });

    expect(wrapper.find('.primary').exists()).toBe(true);
  });
});
