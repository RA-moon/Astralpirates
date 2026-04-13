import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import HonorBadgeList from '~/components/profile/HonorBadgeList.vue';
import type { HonorBadge } from '~/modules/api/schemas';

const buildBadge = (overrides: Partial<HonorBadge> = {}): HonorBadge => ({
  code: 'pioneer',
  label: 'Pioneer',
  description: 'Founding wave badge',
  tooltip: 'Pioneer',
  iconUrl: '/images/badges/pioneer.svg',
  iconMediaUrl: null,
  iconMimeType: null,
  iconFilename: null,
  rarity: 'event',
  awardedAt: '2025-01-02T00:00:00.000Z',
  source: 'automatic',
  note: null,
  ...overrides,
});

describe('HonorBadgeList', () => {
  it('renders badge icons with accessible labels', () => {
    const wrapper = mount(HonorBadgeList, {
      props: {
        badges: [buildBadge()],
      },
    });

    const icon = wrapper.get('.honor-badge__icon');
    expect(icon.attributes('src')).toBe('/images/badges/pioneer.svg');
    expect(wrapper.get('.honor-badge').attributes('title')).toBe('Pioneer');
    expect(wrapper.get('.honor-badge-list').attributes('data-display-mode')).toBe('inline');
  });

  it('falls back to initials when no icon url is provided', () => {
    const wrapper = mount(HonorBadgeList, {
      props: {
        badges: [buildBadge({ iconUrl: '' })],
      },
    });

    expect(wrapper.get('.honor-badge__fallback').text()).toBe('P');
  });

  it('renders video badge media when mime metadata indicates video', () => {
    const wrapper = mount(HonorBadgeList, {
      props: {
        badges: [
          buildBadge({
            iconUrl: '/images/badges/pioneer.svg',
            iconMediaUrl: '/api/honor-badge-media/file/pioneer.mp4',
            iconMimeType: 'video/mp4',
            iconFilename: 'pioneer.mp4',
          }),
        ],
      },
    });

    expect(wrapper.find('video.honor-badge__icon--video').exists()).toBe(true);
    expect(wrapper.find('.honor-badge__model-link').exists()).toBe(false);
  });

  it('renders model badges as external links for non-image/video media', () => {
    const wrapper = mount(HonorBadgeList, {
      props: {
        badges: [
          buildBadge({
            iconUrl: '/images/badges/pioneer.svg',
            iconMediaUrl: '/api/honor-badge-media/file/pioneer.gltf',
            iconMimeType: 'model/gltf+json',
            iconFilename: 'pioneer.gltf',
          }),
        ],
      },
    });

    const modelLink = wrapper.get('.honor-badge__model-link');
    expect(modelLink.attributes('href')).toBe('/api/honor-badge-media/file/pioneer.gltf');
    expect(modelLink.text()).toBe('3D');
  });

  it('falls back to initials when media rendering errors', async () => {
    const wrapper = mount(HonorBadgeList, {
      props: {
        badges: [
          buildBadge({
            iconUrl: '/images/badges/pioneer.svg',
            iconMediaUrl: '/api/honor-badge-media/file/pioneer.png',
            iconMimeType: 'image/png',
            iconFilename: 'pioneer.png',
          }),
        ],
      },
    });

    await wrapper.get('.honor-badge__icon').trigger('error');
    expect(wrapper.get('.honor-badge__fallback').text()).toBe('P');
  });

  it('supports anchored and compact display modes', () => {
    const anchored = mount(HonorBadgeList, {
      props: {
        badges: [buildBadge()],
        displayMode: 'anchored',
      },
    });

    const compact = mount(HonorBadgeList, {
      props: {
        badges: [buildBadge()],
        displayMode: 'compact',
      },
    });

    expect(anchored.get('.honor-badge-list').attributes('data-display-mode')).toBe('anchored');
    expect(compact.get('.honor-badge-list').attributes('data-display-mode')).toBe('compact');
  });
});
