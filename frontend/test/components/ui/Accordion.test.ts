import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiAccordion from '~/components/ui/disclosure/Accordion.vue';

const items = [
  { id: 'one', title: 'Section one', content: 'Alpha' },
  { id: 'two', title: 'Section two', content: 'Beta' },
];

describe('UiAccordion', () => {
  it('toggles panels', async () => {
    const wrapper = mount(UiAccordion, {
      props: { items },
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    const triggers = wrapper.findAll('button');

    await triggers[0].trigger('click');
    await wrapper.vm.$nextTick();
    const firstPanelTexts = wrapper.findAll('.ui-accordion__panel').map((panel) => panel.text());
    expect(firstPanelTexts.some((text) => text.includes('Alpha'))).toBe(true);
    expect(triggers[0].attributes('aria-expanded')).toBe('true');

    await triggers[1].trigger('click');
    await wrapper.vm.$nextTick();
    const secondPanelTexts = wrapper.findAll('.ui-accordion__panel').map((panel) => panel.text());
    expect(secondPanelTexts.some((text) => text.includes('Beta'))).toBe(true);
    expect(triggers[0].attributes('aria-expanded')).toBe('false');
    expect(triggers[1].attributes('aria-expanded')).toBe('true');
  });
});
