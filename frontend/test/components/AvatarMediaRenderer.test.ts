import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import AvatarMediaRenderer from '~/components/AvatarMediaRenderer.vue';
import { AVATAR_FALLBACK_IMAGE_URL } from '~/modules/media/avatarUrls';

describe('AvatarMediaRenderer', () => {
  afterEach(() => {
    delete process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED;
  });

  it('falls back to bundled image when avatar URL is missing', () => {
    const wrapper = mount(AvatarMediaRenderer, {
      props: {
        avatarUrl: null,
      },
    });

    const image = wrapper.find('img.avatar-media__image');
    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toBe(AVATAR_FALLBACK_IMAGE_URL);
  });

  it('renders image mode when tri-mode feature flag is disabled', () => {
    delete process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED;
    const wrapper = mount(AvatarMediaRenderer, {
      props: {
        avatarMediaType: 'video',
        avatarMediaUrl: '/api/avatars/file/captain.mp4',
      },
    });

    expect(wrapper.find('video.avatar-media__video').exists()).toBe(false);
    const image = wrapper.find('img.avatar-media__image');
    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toBe(AVATAR_FALLBACK_IMAGE_URL);
  });

  it('renders video avatars when media type is video', () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    const wrapper = mount(AvatarMediaRenderer, {
      props: {
        avatarMediaType: 'video',
        avatarMediaUrl: '/api/avatars/file/captain.mp4',
      },
    });

    const video = wrapper.find('video.avatar-media__video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe('/api/avatars/file/captain.mp4');
  });

  it('renders embedded model viewer for GLB avatars in non-compact mode', () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    const wrapper = mount(AvatarMediaRenderer, {
      props: {
        avatarMediaType: 'model',
        avatarMediaUrl: '/api/avatars/file/captain.glb',
      },
      global: {
        stubs: {
          UiModelViewer3D: {
            template: '<div data-testid="avatar-model-viewer" />',
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="avatar-model-viewer"]').exists()).toBe(true);
    expect(wrapper.find('.avatar-media__model-link-card').exists()).toBe(false);
  });

  it('falls back to model link card for non-embeddable models', () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    const wrapper = mount(AvatarMediaRenderer, {
      props: {
        avatarMediaType: 'model',
        avatarMediaUrl: '/api/avatars/file/captain.gltf',
      },
      global: {
        stubs: {
          UiModelViewer3D: true,
        },
      },
    });

    expect(wrapper.find('.avatar-media__model-link-card').exists()).toBe(true);
    expect(wrapper.find('.avatar-media__model-link[href="/api/avatars/file/captain.gltf"]').exists()).toBe(true);
  });

  it('uses compact model badge in compact mode', () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    const wrapper = mount(AvatarMediaRenderer, {
      props: {
        avatarMediaType: 'model',
        avatarMediaUrl: '/api/avatars/file/captain.glb',
        compact: true,
      },
      global: {
        stubs: {
          UiModelViewer3D: true,
        },
      },
    });

    expect(wrapper.find('.avatar-media__model-link--compact').exists()).toBe(true);
  });
});
