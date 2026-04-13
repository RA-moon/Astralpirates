import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import GallerySection from '~/components/gallery/GallerySection.vue';

afterEach(() => {
  delete (globalThis as any).__mockRuntimeConfig;
});

describe('GallerySection', () => {
  it('renders a carousel with description fallback from caption', () => {
    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        subtitle: 'Subtitle',
        slides: [
          {
            label: 'Slide one',
            title: '',
            description: '',
            caption: 'Fallback caption',
            imageType: 'url',
            imageUrl: 'https://example.com/one.jpg',
            imageAlt: 'One',
            creditLabel: null,
            creditUrl: null,
            asset: null,
          },
        ],
      },
    });

    expect(wrapper.text()).toContain('Gallery');
    expect(wrapper.text()).toContain('Subtitle');
    expect(wrapper.text()).toContain('Fallback caption');
    expect(wrapper.find('img[alt="One"]').exists()).toBe(true);
  });

  it('shows empty state when configured to display without slides', () => {
    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        slides: [],
        showWhenEmpty: true,
        emptyMessage: 'No slides yet.',
      },
    });

    expect(wrapper.text()).toContain('No slides yet.');
  });

  it('renders uploaded video slides as video media', () => {
    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        slides: [
          {
            label: 'Video one',
            title: '',
            description: '',
            caption: '',
            mediaType: 'video',
            imageType: 'upload',
            imageUrl: 'https://example.com/clip.mp4',
            imageAlt: 'Clip',
            creditLabel: null,
            creditUrl: null,
            asset: {
              id: 12,
              url: 'https://example.com/clip.mp4',
              filename: 'clip.mp4',
              width: null,
              height: null,
              mimeType: 'video/mp4',
              filesize: null,
            },
          },
        ],
      },
    });

    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders uploaded audio slides as audio media', () => {
    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        slides: [
          {
            label: 'Audio one',
            title: '',
            description: '',
            caption: '',
            mediaType: 'audio',
            imageType: 'upload',
            imageUrl: 'https://example.com/briefing.mp3',
            imageAlt: 'Briefing',
            creditLabel: null,
            creditUrl: null,
            asset: {
              id: 13,
              url: 'https://example.com/briefing.mp3',
              filename: 'briefing.mp3',
              width: null,
              height: null,
              mimeType: 'audio/mpeg',
              filesize: null,
            },
          },
        ],
      },
    });

    expect(wrapper.find('audio').exists()).toBe(true);
  });

  it('renders GLB model slides with the embedded viewer', () => {
    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        slides: [
          {
            label: 'Model one',
            title: '',
            description: '',
            caption: '',
            mediaType: 'model',
            imageType: 'url',
            imageUrl: 'https://example.com/ship.glb',
            imageAlt: 'Ship model',
            creditLabel: null,
            creditUrl: null,
            asset: null,
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

  it('falls back to external link for non-GLB model slides', () => {
    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        slides: [
          {
            label: 'Model one',
            title: '',
            description: '',
            caption: '',
            mediaType: 'model',
            imageType: 'url',
            imageUrl: 'https://example.com/ship.gltf',
            imageAlt: 'Ship model',
            creditLabel: null,
            creditUrl: null,
            asset: null,
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
    expect(wrapper.find('a[href="https://example.com/ship.gltf"]').exists()).toBe(true);
  });

  it('normalizes upload URLs through the gallery file proxy when filename is available', () => {
    (globalThis as any).__mockRuntimeConfig = () => ({
      astralApiBase: 'http://cms:3000',
      public: { astralApiBase: 'http://cms:3000' },
    });

    const wrapper = mount(GallerySection, {
      props: {
        title: 'Gallery',
        slides: [
          {
            label: 'Slide one',
            title: 'Slide one',
            description: '',
            caption: '',
            imageType: 'upload',
            imageUrl: 'https://artifact.astralpirates.com/gallery/mission%201.png',
            imageAlt: 'One',
            creditLabel: null,
            creditUrl: null,
            asset: {
              id: 9,
              url: 'https://artifact.astralpirates.com/gallery/mission%201.png',
              filename: 'mission 1.png',
              width: null,
              height: null,
              mimeType: null,
              filesize: null,
            },
          },
        ],
      },
    });

    expect(wrapper.find('img').attributes('src')).toBe(
      '/api/gallery-images/file/mission%201.png?fallback=image',
    );
  });
});
