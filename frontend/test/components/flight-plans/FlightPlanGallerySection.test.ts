import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FlightPlanGallerySection from '~/components/flight-plans/FlightPlanGallerySection.vue';
import { useAssetZoomState } from '~/composables/useAssetZoomState';

const flushUi = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  useAssetZoomState().closeAssetZoom({ force: true, syncMenuObject: false });
  document.body.innerHTML = '';
});

describe('FlightPlanGallerySection', () => {
  it('renders the carousel when slides exist', () => {
    const wrapper = mount(FlightPlanGallerySection, {
      props: {
        slides: [
          { label: 'Slide A', imageUrl: 'https://example.com/a.jpg', imageAlt: 'A' },
          { label: 'Slide B', imageUrl: 'https://example.com/b.jpg', imageAlt: 'B' },
        ],
        canEdit: false,
      },
    });

    expect(wrapper.text()).toContain('Mission gallery');
    expect(wrapper.text()).toContain('Reference media shared with the crew.');
    expect(wrapper.find('img[alt="A"]').exists()).toBe(true);
    expect(wrapper.find("button[aria-label='Go to Slide B']").exists()).toBe(true);
  });

  it('shows the helper message when the captain can edit but no slides exist', () => {
    const wrapper = mount(FlightPlanGallerySection, {
      props: {
        slides: [],
        canEdit: true,
      },
    });

    expect(wrapper.text()).toContain('Mission gallery');
    expect(wrapper.text()).toContain('Add up to eight reference media items from the mission editor to guide the crew.');
  });

  it('inherits shared asset zoom behavior on the mission gallery surface', async () => {
    const wrapper = mount(FlightPlanGallerySection, {
      props: {
        slides: [{ label: 'Slide A', imageUrl: 'https://example.com/a.jpg', imageAlt: 'A' }],
        canEdit: false,
      },
      attachTo: document.body,
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    await wrapper.find('.ui-carousel__slide').trigger('click');
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).toBeNull();
  });
});
