import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import CrewIdentityCard from '~/components/CrewIdentityCard.vue';

const mountCard = (options: Parameters<typeof mount>[1] = {}) =>
  mount(CrewIdentityCard, {
    ...options,
    global: {
      components: {
        NuxtLink: { template: '<a><slot /></a>' },
      },
      ...(options.global ?? {}),
    },
  });

describe('CrewIdentityCard', () => {
  it('renders default lg variant when no size is provided', () => {
    const wrapper = mountCard({
      props: {
        callSign: 'Blackstar',
        status: 'online',
      },
    });

    expect(wrapper.classes()).toContain('crew-identity');
    expect(wrapper.classes()).toContain('crew-identity--lg');
    expect(wrapper.attributes('data-status')).toBe('online');
    expect(wrapper.find('.crew-identity__meta').exists()).toBe(false);
  });

  it('switches to NuxtLink when `to` is provided', () => {
    const wrapper = mountCard({
      props: {
        callSign: 'Navigator',
        to: '/gangway/crew-quarters/navigator',
        metaLabel: 'crew-quarters',
      },
    });

    const anchor = wrapper.find('a');
    expect(anchor.exists()).toBe(true);
    expect(anchor.attributes('href')).toBe('/gangway/crew-quarters/navigator');
    expect(wrapper.classes()).toContain('crew-identity--lg');
    expect(wrapper.find('.crew-identity__meta').text()).toBe('crew-quarters');
  });

  it('links to crew profile when only profileSlug is provided', () => {
    const wrapper = mountCard({
      props: {
        callSign: 'Aurora',
        profileSlug: 'aurora',
      },
    });

    const anchor = wrapper.find('a');
    expect(anchor.exists()).toBe(true);
    expect(anchor.attributes('href')).toBe('/gangway/crew-quarters/aurora');
    expect(wrapper.classes()).toContain('crew-identity--interactive');
  });

  it('renders meta slot when provided', () => {
    const wrapper = mountCard({
      props: {
        callSign: 'Tempest',
        status: 'offline',
      },
      slots: {
        meta: '<span class="custom-meta">Docked</span>',
      },
    });

    const meta = wrapper.find('.crew-identity__meta');
    expect(meta.exists()).toBe(true);
    expect(meta.text()).toBe('Docked');
    expect(meta.attributes('data-status')).toBe('offline');
    expect(meta.find('.custom-meta').exists()).toBe(true);
  });

  it('applies requested size variant', () => {
    const wrapper = mountCard({
      props: {
        callSign: 'Signal',
        size: 'sm',
      },
    });

    expect(wrapper.classes()).toContain('crew-identity--sm');
    expect(wrapper.classes()).not.toContain('crew-identity--lg');
  });

  it('falls back to lg variant for unknown size values', () => {
    const wrapper = mountCard({
      // @ts-expect-error testing invalid input
      props: {
        callSign: 'Drift',
        size: 'mega',
      },
    });

    expect(wrapper.classes()).toContain('crew-identity--lg');
  });
});
