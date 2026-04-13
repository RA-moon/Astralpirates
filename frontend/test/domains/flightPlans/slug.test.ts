import { describe, expect, it } from 'vitest';

import { resolveFlightPlanPath } from '~/domains/flightPlans/slug';

describe('resolveFlightPlanPath', () => {
  it('extracts plan and owner slugs from legacy bridge paths', () => {
    const result = resolveFlightPlanPath('/bridge/flight-plans/captain-mali/unicorn-party');
    expect(result.planSlug).toBe('unicorn-party');
    expect(result.ownerSlug).toBe('captain-mali');
  });

  it('ignores owner segment for slug-only paths', () => {
    const result = resolveFlightPlanPath('/bridge/flight-plans/unicorn-party');
    expect(result.planSlug).toBe('unicorn-party');
    expect(result.ownerSlug).toBeNull();
  });

  it('handles legacy /flight-plans paths with events segment', () => {
    const result = resolveFlightPlanPath('/flight-plans/events/captain/unicorn-party');
    expect(result.planSlug).toBe('unicorn-party');
    expect(result.ownerSlug).toBe('captain');
  });

  it('returns null plan slug for listing routes', () => {
    const bridgeListing = resolveFlightPlanPath('/bridge/flight-plans');
    const legacyListing = resolveFlightPlanPath('/flight-plans');
    expect(bridgeListing.planSlug).toBeNull();
    expect(legacyListing.planSlug).toBeNull();
  });
});
