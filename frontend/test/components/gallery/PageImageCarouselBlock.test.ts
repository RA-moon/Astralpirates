import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PageImageCarouselBlock from '~/components/page-blocks/PageImageCarouselBlock.vue';
import { useAssetZoomState } from '~/composables/useAssetZoomState';

const flushUi = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  useAssetZoomState().closeAssetZoom({ force: true, syncMenuObject: false });
  document.body.innerHTML = '';
});

describe('PageImageCarouselBlock', () => {
  it('inherits shared asset zoom behavior on static-page carousel blocks', async () => {
    const wrapper = mount(PageImageCarouselBlock, {
      props: {
        block: {
          title: 'Static gallery',
          intro: [],
          slides: [
            {
              label: 'Slide one',
              title: 'Slide one',
              caption: 'Caption one',
              imageType: 'url',
              imageUrl: 'https://example.com/one.jpg',
              imageAlt: 'One',
              mediaType: 'image',
              creditLabel: null,
              creditUrl: null,
              galleryImage: null,
            },
          ],
        },
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
