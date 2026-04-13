import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthorizationDecisionTelemetrySnapshot,
  recordAuthorizationDecision,
  resetAuthorizationDecisionTelemetry,
} from '@/app/api/_lib/authorizationDecisionTelemetry';

describe('authorizationDecisionTelemetry', () => {
  const originalElevatedReadThreshold = process.env.AUTHZ_ALERT_ELEVATED_READ_ALLOW_THRESHOLD;
  const originalElevatedEditThreshold = process.env.AUTHZ_ALERT_ELEVATED_EDIT_ALLOW_THRESHOLD;
  const originalAdminDenyThreshold = process.env.AUTHZ_ALERT_ADMIN_DENY_THRESHOLD;

  beforeEach(() => {
    resetAuthorizationDecisionTelemetry();
    if (typeof originalElevatedReadThreshold === 'string') {
      process.env.AUTHZ_ALERT_ELEVATED_READ_ALLOW_THRESHOLD = originalElevatedReadThreshold;
    } else {
      delete process.env.AUTHZ_ALERT_ELEVATED_READ_ALLOW_THRESHOLD;
    }
    if (typeof originalElevatedEditThreshold === 'string') {
      process.env.AUTHZ_ALERT_ELEVATED_EDIT_ALLOW_THRESHOLD = originalElevatedEditThreshold;
    } else {
      delete process.env.AUTHZ_ALERT_ELEVATED_EDIT_ALLOW_THRESHOLD;
    }
    if (typeof originalAdminDenyThreshold === 'string') {
      process.env.AUTHZ_ALERT_ADMIN_DENY_THRESHOLD = originalAdminDenyThreshold;
    } else {
      delete process.env.AUTHZ_ALERT_ADMIN_DENY_THRESHOLD;
    }
  });

  it('tracks allow/deny counters and elevated allow decisions', () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    recordAuthorizationDecision({
      payload: { logger },
      capability: 'createFlightPlans',
      allowed: true,
      reasonCode: 'allow_min_role',
      actorId: 7,
      actorRole: 'captain',
      resourceType: 'route',
      resourceSlug: '/api/flight-plans',
    });

    recordAuthorizationDecision({
      payload: { logger },
      capability: 'editFlightPlan',
      allowed: false,
      reasonCode: 'deny_membership_required',
      actorId: 9,
      actorRole: 'crew',
      resourceType: 'flight-plan',
      resourceId: 22,
      resourceSlug: '20260404-lamp-02-concretewood',
    });

    recordAuthorizationDecision({
      payload: { logger },
      capability: 'adminReadAllContent',
      allowed: true,
      reasonCode: 'allow_admin_mode_enabled',
      actorId: 63,
      actorRole: 'captain',
      resourceType: 'request',
      resourceSlug: '/api/flight-plans/20260404-lamp-02-concretewood',
    });
    recordAuthorizationDecision({
      payload: { logger },
      capability: 'adminEditAllContent',
      allowed: true,
      reasonCode: 'allow_admin_mode_enabled',
      actorId: 63,
      actorRole: 'captain',
      resourceType: 'request',
      resourceSlug: '/api/flight-plans/20260404-lamp-02-concretewood',
    });

    const snapshot = getAuthorizationDecisionTelemetrySnapshot();

    expect(snapshot.observedEvents).toBe(4);
    expect(snapshot.allowEvents).toBe(3);
    expect(snapshot.denyEvents).toBe(1);
    expect(snapshot.elevatedAllowEvents).toBe(2);
    expect(snapshot.elevatedReadAllowEvents).toBe(1);
    expect(snapshot.elevatedEditAllowEvents).toBe(1);
    expect(snapshot.adminCapabilityDenyEvents).toBe(0);
    expect(snapshot.alertThresholds).toMatchObject({
      elevatedReadAllowEvents: expect.any(Number),
      elevatedEditAllowEvents: expect.any(Number),
      adminCapabilityDenyEvents: expect.any(Number),
    });
    expect(snapshot.alerts).toEqual([]);
    expect(snapshot.lastEventAt).toEqual(expect.any(String));
    expect(snapshot.counters).toEqual(
      expect.arrayContaining([
        { key: 'adminEditAllContent:allow:allow_admin_mode_enabled', value: 1 },
        { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 1 },
        { key: 'createFlightPlans:allow:allow_min_role', value: 1 },
        { key: 'editFlightPlan:deny:deny_membership_required', value: 1 },
      ]),
    );

    expect(logger.info).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('records counters even when payload logger is unavailable', () => {
    recordAuthorizationDecision({
      payload: null,
      capability: 'adminEditAllContent',
      allowed: false,
      reasonCode: 'deny_ineligible_role',
      actorId: null,
      actorRole: null,
      resourceType: 'request',
    });

    const snapshot = getAuthorizationDecisionTelemetrySnapshot();
    expect(snapshot.observedEvents).toBe(1);
    expect(snapshot.allowEvents).toBe(0);
    expect(snapshot.denyEvents).toBe(1);
    expect(snapshot.elevatedAllowEvents).toBe(0);
    expect(snapshot.elevatedReadAllowEvents).toBe(0);
    expect(snapshot.elevatedEditAllowEvents).toBe(0);
    expect(snapshot.adminCapabilityDenyEvents).toBe(1);
    expect(snapshot.alertThresholds).toMatchObject({
      elevatedReadAllowEvents: expect.any(Number),
      elevatedEditAllowEvents: expect.any(Number),
      adminCapabilityDenyEvents: expect.any(Number),
    });
    expect(snapshot.alerts).toEqual([]);
    expect(snapshot.counters).toEqual([
      { key: 'adminEditAllContent:deny:deny_ineligible_role', value: 1 },
    ]);
  });

  it('triggers alert snapshots and logs when configured thresholds are reached', () => {
    process.env.AUTHZ_ALERT_ELEVATED_READ_ALLOW_THRESHOLD = '1';
    process.env.AUTHZ_ALERT_ELEVATED_EDIT_ALLOW_THRESHOLD = '1';
    process.env.AUTHZ_ALERT_ADMIN_DENY_THRESHOLD = '1';

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    recordAuthorizationDecision({
      payload: { logger },
      capability: 'adminReadAllContent',
      allowed: true,
      reasonCode: 'allow_admin_mode_enabled',
      actorId: 7,
      actorRole: 'captain',
      resourceType: 'request',
      resourceSlug: '/api/flight-plans/sample',
    });

    recordAuthorizationDecision({
      payload: { logger },
      capability: 'adminEditAllContent',
      allowed: true,
      reasonCode: 'allow_admin_mode_enabled',
      actorId: 7,
      actorRole: 'captain',
      resourceType: 'request',
      resourceSlug: '/api/flight-plans/sample',
    });

    recordAuthorizationDecision({
      payload: { logger },
      capability: 'adminEditAllContent',
      allowed: false,
      reasonCode: 'deny_ineligible_role',
      actorId: 8,
      actorRole: 'crew',
      resourceType: 'request',
      resourceSlug: '/api/flight-plans/sample',
    });

    const snapshot = getAuthorizationDecisionTelemetrySnapshot();
    expect(snapshot.alertThresholds).toEqual({
      elevatedReadAllowEvents: 1,
      elevatedEditAllowEvents: 1,
      adminCapabilityDenyEvents: 1,
    });
    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        { key: 'elevatedReadAllowEvents', observed: 1, threshold: 1 },
        { key: 'elevatedEditAllowEvents', observed: 1, threshold: 1 },
        { key: 'adminCapabilityDenyEvents', observed: 1, threshold: 1 },
      ]),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'authorization_decision_alert',
        key: 'adminCapabilityDenyEvents',
        observed: 1,
        threshold: 1,
      }),
      '[authorization] decision alert threshold reached',
    );
  });
});
