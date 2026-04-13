import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import UiImageCarousel from '~/components/ui/media/ImageCarousel.vue';
import { useAssetZoomState } from '~/composables/useAssetZoomState';

const slides = [
  { label: 'One', imageUrl: '/one.jpg', imageAlt: 'One' },
  { label: 'Two', imageUrl: '/two.jpg', imageAlt: 'Two' },
];

const flushUi = () => new Promise((resolve) => setTimeout(resolve, 0));

const dispatchTouchPointer = ({
  target,
  type,
  clientX,
  clientY,
  pointerId = 1,
}: {
  target: Element;
  type: 'pointerdown' | 'pointerup' | 'pointercancel';
  clientX: number;
  clientY: number;
  pointerId?: number;
}) => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerType: { configurable: true, value: 'touch' },
    pointerId: { configurable: true, value: pointerId },
    isPrimary: { configurable: true, value: true },
    clientX: { configurable: true, value: clientX },
    clientY: { configurable: true, value: clientY },
  });
  target.dispatchEvent(event);
};

afterEach(() => {
  useAssetZoomState().closeAssetZoom({ force: true, syncMenuObject: false });
  document.body.innerHTML = '';
});
enableAutoUnmount(afterEach);

describe('UiImageCarousel', () => {
  it('cycles slides', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: { slides },
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    const slideTexts = () => wrapper.findAll('strong').map((node) => node.text());

    expect(slideTexts()).toContain('One');
    await wrapper.findAll('.ui-carousel__dot')[1].trigger('click');
    await wrapper.vm.$nextTick();
    await flushUi();

    const dots = wrapper.findAll('.ui-carousel__dot');
    const activeDot = wrapper.find('.ui-carousel__dot--active');
    expect(activeDot.element).toBe(dots[1].element);
  });

  it('renders video slides with a <video> tag', () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [
          {
            label: 'Video',
            imageUrl: '/clip.mp4',
            imageAlt: 'Clip',
            mediaType: 'video',
          },
        ],
      },
    });

    expect(wrapper.find('video').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders audio slides with an <audio> tag', () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [
          {
            label: 'Audio',
            imageUrl: '/briefing.mp3',
            imageAlt: 'Briefing',
            mediaType: 'audio',
          },
        ],
      },
    });

    expect(wrapper.find('audio').exists()).toBe(true);
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders GLB model slides with the embedded model viewer', () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [
          {
            label: 'Model',
            imageUrl: '/ship.glb',
            imageAlt: 'Ship model',
            mediaType: 'model',
          },
        ],
      },
      global: {
        stubs: {
          UiModelViewer3D: {
            template: '<div data-testid="embedded-model-viewer" />',
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="embedded-model-viewer"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Open 3D model');
  });

  it('falls back to external model link for non-GLB model slides', () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [
          {
            label: 'Model',
            imageUrl: '/ship.gltf',
            imageAlt: 'Ship model',
            mediaType: 'model',
          },
        ],
      },
      global: {
        stubs: {
          UiModelViewer3D: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Open 3D model');
    expect(wrapper.find('a[href="/ship.gltf"]').exists()).toBe(true);
  });

  it('opens asset zoom on click and closes when the menu object toggles', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [{ label: 'One', imageUrl: '/one.jpg', imageAlt: 'One' }],
      },
      attachTo: document.body,
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    expect(document.body.querySelector('.ui-carousel-asset-zoom')).toBeNull();

    await wrapper.find('.ui-carousel__slide').trigger('click');
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).not.toBeNull();

    window.dispatchEvent(
      new CustomEvent('astral:menu-toggle', {
        detail: {
          source: 'menu-icon',
          action: 'toggle',
        },
      }),
    );

    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).toBeNull();
  });

  it('opens asset zoom from keyboard and closes on Escape', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [{ label: 'One', imageUrl: '/one.jpg', imageAlt: 'One' }],
      },
      attachTo: document.body,
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    await wrapper.find('.ui-carousel__slide').trigger('keydown', { key: 'Enter' });
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).toBeNull();
  });

  it('hides fullscreen arrows when there is only one slide', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [{ label: 'One', imageUrl: '/one.jpg', imageAlt: 'One' }],
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
    expect(document.body.querySelector('.ui-carousel-asset-zoom__nav')).toBeNull();

    wrapper.unmount();
    await flushUi();
  });

  it('keeps fullscreen arrow navigation looping across multiple slides', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: { slides },
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

    expect(document.body.querySelector('.ui-carousel-asset-zoom__nav')).not.toBeNull();

    const nextButton = document.body.querySelector<HTMLButtonElement>(
      '.ui-carousel-asset-zoom__nav--next',
    );
    expect(nextButton).not.toBeNull();

    nextButton?.click();
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom strong')?.textContent).toContain(
      'Two',
    );

    nextButton?.click();
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom strong')?.textContent).toContain(
      'One',
    );

    wrapper.unmount();
    await flushUi();
  });

  it('supports horizontal touch swipe navigation in asset zoom mode', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: { slides },
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

    const activeLabel = () => document.body.querySelector('.ui-carousel-asset-zoom strong')?.textContent ?? '';
    const stage = document.body.querySelector('.ui-carousel-asset-zoom__stage');
    expect(stage).not.toBeNull();

    dispatchTouchPointer({
      target: stage as Element,
      type: 'pointerdown',
      clientX: 260,
      clientY: 120,
    });
    dispatchTouchPointer({
      target: stage as Element,
      type: 'pointerup',
      clientX: 120,
      clientY: 126,
    });
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('Two');

    dispatchTouchPointer({
      target: stage as Element,
      type: 'pointerdown',
      clientX: 180,
      clientY: 120,
    });
    dispatchTouchPointer({
      target: stage as Element,
      type: 'pointerup',
      clientX: 188,
      clientY: 250,
    });
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('Two');

    dispatchTouchPointer({
      target: stage as Element,
      type: 'pointerdown',
      clientX: 120,
      clientY: 120,
    });
    dispatchTouchPointer({
      target: stage as Element,
      type: 'pointerup',
      clientX: 260,
      clientY: 128,
    });
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('One');
  });

  it('handles unified fullscreen nav bridge commands only while zoom is active', async () => {
    const wrapper = mount(UiImageCarousel, {
      props: { slides },
      attachTo: document.body,
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    const activeLabel = () => document.body.querySelector('.ui-carousel-asset-zoom strong')?.textContent ?? '';

    window.dispatchEvent(
      new CustomEvent('astral:asset-zoom-nav', {
        detail: { action: 'next', source: 'external-test' },
      }),
    );
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(document.body.querySelector('.ui-carousel-asset-zoom')).toBeNull();

    await wrapper.find('.ui-carousel__slide').trigger('click');
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('One');

    window.dispatchEvent(
      new CustomEvent('astral:asset-zoom-nav', {
        detail: { action: 'next', source: 'external-test' },
      }),
    );
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('Two');

    window.dispatchEvent(
      new CustomEvent('astral:asset-zoom-nav', {
        detail: { action: 'goTo', index: 99, source: 'external-test' },
      }),
    );
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('Two');

    window.dispatchEvent(
      new CustomEvent('astral:asset-zoom-nav', {
        detail: { action: 'unknown-action', source: 'external-test' },
      }),
    );
    await wrapper.vm.$nextTick();
    await flushUi();
    expect(activeLabel()).toContain('Two');

    wrapper.unmount();
    await flushUi();
  });

  it('renders unknown media types with a deterministic fallback link', () => {
    const wrapper = mount(UiImageCarousel, {
      props: {
        slides: [
          {
            label: 'Unknown',
            imageUrl: '/asset.bin',
            imageAlt: 'Unknown asset',
            mediaType: 'application/octet-stream',
          },
        ],
      },
    });

    expect(wrapper.text()).toContain('Open media asset');
    expect(wrapper.find('a[href="/asset.bin"]').exists()).toBe(true);
  });
});
