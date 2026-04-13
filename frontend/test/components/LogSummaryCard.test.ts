import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import LogSummaryCard from '~/components/LogSummaryCard.vue';
import CrewAvatarStack from '~/components/CrewAvatarStack.vue';
import type { LogSummary } from '~/modules/api/schemas';

const buildLog = (overrides: Partial<LogSummary> = {}): LogSummary => ({
  id: 42,
  title: 'Resupply Mission',
  slug: 'resupply-mission',
  path: '/bridge/logbook/resupply-mission',
  href: '/bridge/logbook/resupply-mission',
  body: null,
  dateCode: '20251030181228',
  logDate: '2025-10-30T18:12:28.000Z',
  createdAt: '2025-10-30T18:12:28.000Z',
  updatedAt: '2025-10-30T18:12:28.000Z',
  headline: 'Atmosphere Online',
  tagline: null,
  summary: 'Quick resupply at the outpost.',
  excerpt: null,
  displayLabel: null,
  owner: {
    id: 99,
    profileSlug: 'blackstar',
    displayName: 'Blackstar',
    callSign: 'Blackstar',
    role: 'captain',
    avatarUrl: 'https://example.com/avatar.png',
  },
  flightPlanId: null,
  ...overrides,
});

describe('LogSummaryCard', () => {
  it('renders log code, title, and identity card', () => {
    const wrapper = mount(LogSummaryCard, {
      props: { log: buildLog() },
    });

    expect(wrapper.find('.log-summary-card__stamp').text()).toContain('LOG 20251030181228');
    expect(wrapper.find('.log-summary-card__headline').text()).toContain('Atmosphere Online');
    expect(wrapper.find('.log-summary-card__identity').exists()).toBe(true);
    expect(wrapper.find('.log-summary-card__copy').attributes('href')).toBe('/bridge/logbook/resupply-mission');
  });

  it('links the avatar stack to the crew profile', () => {
    const wrapper = mount(LogSummaryCard, {
      props: { log: buildLog() },
    });

    const stack = wrapper.findComponent(CrewAvatarStack);
    expect(stack.exists()).toBe(true);
    const avatarLink = stack.find('.crew-avatar-stack__avatar');
    expect(avatarLink.exists()).toBe(true);
    expect(avatarLink.attributes('href')).toBe('/gangway/crew-quarters/blackstar');
  });

  it('shows mission metadata when provided', () => {
    const wrapper = mount(LogSummaryCard, {
      props: {
        log: buildLog(),
        mission: {
          title: 'Alpha Run',
          location: 'Lunar Base',
          displayDate: 'Nov 3',
        },
      },
    });

    const missionText = wrapper.find('.log-summary-card__mission').text();
    expect(missionText).toContain('Flight plan: Alpha Run • Lunar Base • Nov 3');
    expect(wrapper.find('.log-summary-card__actions .ui-link-button').exists()).toBe(false);
  });

  it('renders mission CTA when href is provided', () => {
    const wrapper = mount(LogSummaryCard, {
      props: {
        log: buildLog(),
        mission: {
          title: 'Bravo Station',
          href: '/bridge/flight-plans/bravo',
        },
      },
    });

    const cta = wrapper.find('.log-summary-card__actions .ui-link-button');
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toBe('View mission');
    expect(cta.attributes('href')).toBe('/bridge/flight-plans/bravo');
  });

  it('falls back to slug when title missing', () => {
    const wrapper = mount(LogSummaryCard, {
      props: {
        log: buildLog({
          headline: '',
          dateCode: null,
        }),
      },
    });

    expect(wrapper.find('.log-summary-card__stamp').text()).toContain('LOG resupply-mission');
  });

  it('handles missing owner gracefully', () => {
    const wrapper = mount(LogSummaryCard, {
      props: {
        log: buildLog({
          owner: null,
        }),
      },
    });

    expect(wrapper.find('.log-summary-card__anonymous').exists()).toBe(true);
    expect(wrapper.find('.log-summary-card__anonymous').text()).toBe('Unknown crew');
  });
});
