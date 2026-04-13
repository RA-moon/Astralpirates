import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import UiHeading from '~/components/ui/foundations/Heading.vue';

describe('UiHeading', () => {
  it('animates level 1 headings by default', () => {
    const wrapper = mount(UiHeading, {
      props: { level: 1 },
      slots: { default: 'Heading' },
    });

    expect(wrapper.classes()).toContain('animated-title');
    expect(wrapper.classes()).not.toContain('animated-title--reverse');
  });

  it('animates level 2 headings in reverse by default', () => {
    const wrapper = mount(UiHeading, {
      props: { level: 2 },
      slots: { default: 'Heading' },
    });

    expect(wrapper.classes()).toContain('animated-title');
    expect(wrapper.classes()).toContain('animated-title--reverse');
  });

  it('does not animate level 3 headings by default', () => {
    const wrapper = mount(UiHeading, {
      props: { level: 3 },
      slots: { default: 'Heading' },
    });

    expect(wrapper.classes()).not.toContain('animated-title');
    expect(wrapper.classes()).not.toContain('animated-title--reverse');
  });

  it('respects explicit animation overrides', () => {
    const wrapper = mount(UiHeading, {
      props: { level: 3, animated: true },
      slots: { default: 'Heading' },
    });

    expect(wrapper.classes()).toContain('animated-title');
    expect(wrapper.classes()).not.toContain('animated-title--reverse');

    const disabled = mount(UiHeading, {
      props: { level: 1, animated: false },
      slots: { default: 'Heading' },
    });
    expect(disabled.classes()).not.toContain('animated-title');
  });
});
