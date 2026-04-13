import { describe, expect, it } from 'vitest';

import {
  buildFlightPlanPath,
  extractFlightPlanSlug,
  resolveFlightPlanHref,
} from '~/utils/flightPlans';

describe('flight plan path helpers', () => {
  describe('buildFlightPlanPath', () => {
    it('returns collection path when slug missing', () => {
      expect(buildFlightPlanPath('')).toBe('/bridge/flight-plans');
      expect(buildFlightPlanPath('   ')).toBe('/bridge/flight-plans');
    });

    it('builds path ignoring owner slug', () => {
      expect(buildFlightPlanPath('unicorn-plan')).toBe('/bridge/flight-plans/unicorn-plan');
      expect(buildFlightPlanPath('party', 'captain')).toBe('/bridge/flight-plans/party');
      expect(buildFlightPlanPath('/party/', '/captain/')).toBe('/bridge/flight-plans/party');
    });
  });

  describe('resolveFlightPlanHref', () => {
    it('falls back to slug when only slug provided', () => {
      expect(resolveFlightPlanHref({ slug: 'unicorn-party' })).toBe(
        '/bridge/flight-plans/unicorn-party',
      );
    });

    it('ignores owner profile slug when building href', () => {
      expect(
        resolveFlightPlanHref({
          slug: 'unicorn-party',
          owner: { profileSlug: 'captain-mali' },
        }),
      ).toBe('/bridge/flight-plans/unicorn-party');
    });

    it('extracts slug from href with collection prefixes', () => {
      expect(resolveFlightPlanHref('/flight-plans/events/captain-mali/unicorn-party')).toBe(
        '/bridge/flight-plans/unicorn-party',
      );
    });
  });

  describe('extractFlightPlanSlug', () => {
    it('returns last path segment', () => {
      expect(
        extractFlightPlanSlug('/flight-plans/events/captain-mali/unicorn-party'),
      ).toBe('unicorn-party');
    });
  });
});
