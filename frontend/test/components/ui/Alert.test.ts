import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiAlert from '~/components/ui/feedback/Alert.vue';

describe('UiAlert', () => {
  it('renders title and description text', () => {
    const wrapper = mount(UiAlert, {
      props: {
        title: 'Test alert',
        description: 'Details go here',
        variant: 'warning',
      },
    });

    expect(wrapper.text()).toContain('Test alert');
    expect(wrapper.text()).toContain('Details go here');
    expect(wrapper.classes()).toContain('ui-alert--warning');
  });

  it('emits close events when dismiss button is used', async () => {
    const wrapper = mount(UiAlert, {
      props: {
        title: 'Closable',
        closable: true,
      },
    });

    await wrapper.get('button.ui-alert__close').trigger('click');
    expect(wrapper.emitted().close).toHaveLength(1);
  });

  it('supports inline layout without description', () => {
    const wrapper = mount(UiAlert, {
      props: {
        title: 'Inline alert',
        layout: 'inline',
      },
    });

    expect(wrapper.classes()).toContain('ui-alert--inline');
    expect(wrapper.find('.ui-alert__description').exists()).toBe(false);
  });
});
