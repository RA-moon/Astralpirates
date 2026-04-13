import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import SiteMenu from '~/components/SiteMenu.vue';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('SiteMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens overlay after clicking toggle', async () => {
    const wrapper = mount(SiteMenu);
    await flush();

    expect(document.body.querySelector('.site-menu-drawer')).toBeNull();

    await wrapper.find('.site-menu__toggle').trigger('click');
    await flush();

    expect(document.body.querySelector('.site-menu-drawer')).not.toBeNull();

    await wrapper.unmount();
  });
});
