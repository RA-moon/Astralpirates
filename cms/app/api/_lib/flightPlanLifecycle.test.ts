import { describe, expect, it } from 'vitest';

import {
  buildStatusMutationData,
  canHardDeleteFlightPlan,
  canManageFlightPlanLifecycle,
  parseFlightPlanBucketFilter,
  parseFlightPlanStatusFilters,
  resolveStatusesForBucket,
  validateReopenRequest,
  validateTransitionRequest,
} from './flightPlanLifecycle';

describe('flightPlanLifecycle helpers', () => {
  it('parses status filters and normalizes aliases', () => {
    const parsed = parseFlightPlanStatusFilters(['planned', 'canceled', 'abortet']);
    expect(parsed).toEqual({
      ok: true,
      statuses: ['planned', 'cancelled', 'aborted'],
    });

    const invalid = parseFlightPlanStatusFilters(['unknown']);
    expect(invalid.ok).toBe(false);
  });

  it('parses bucket filters and resolves bucket statuses', () => {
    expect(parseFlightPlanBucketFilter('finished')).toEqual({ ok: true, bucket: 'finished' });
    expect(parseFlightPlanBucketFilter('bad')).toEqual({
      ok: false,
      error: 'bucket must be one of: active, finished, archived.',
    });

    expect(resolveStatusesForBucket('active')).toEqual(['ongoing']);
    expect(resolveStatusesForBucket('finished')).toEqual([
      'success',
      'failure',
      'aborted',
      'cancelled',
    ]);
    expect(resolveStatusesForBucket('archived')).toEqual([
      'planned',
      'pending',
      'on-hold',
      'postponed',
    ]);
  });

  it('enforces lifecycle permissions and hard-delete permissions', () => {
    expect(
      canManageFlightPlanLifecycle({
        ownerId: 7,
        user: { id: 7, role: 'passenger' },
      }),
    ).toBe(true);

    expect(
      canManageFlightPlanLifecycle({
        ownerId: 7,
        user: { id: 8, role: 'sailing-master' },
      }),
    ).toBe(true);

    expect(
      canManageFlightPlanLifecycle({
        ownerId: 7,
        user: { id: 8, role: 'crew' },
      }),
    ).toBe(false);

    expect(
      canHardDeleteFlightPlan({
        ownerId: 7,
        user: { id: 8, role: 'quartermaster' },
      }),
    ).toBe(true);

    expect(
      canHardDeleteFlightPlan({
        ownerId: 7,
        user: { id: 8, role: 'sailing-master' },
      }),
    ).toBe(false);
  });

  it('validates transitions and reasons', () => {
    const normalized = validateTransitionRequest({
      currentStatus: 'planned',
      targetStatus: 'canceled',
      reason: 'Cancelled due to severe weather and harbour closure.',
    });

    expect(normalized).toMatchObject({
      ok: true,
      toStatus: 'cancelled',
      actionType: 'normalize',
    });

    const missingReason = validateTransitionRequest({
      currentStatus: 'ongoing',
      targetStatus: 'failure',
      reason: 'too short',
    });
    expect(missingReason).toEqual({
      ok: false,
      error: 'statusReason must be at least 12 characters.',
    });

    const invalidTransition = validateTransitionRequest({
      currentStatus: 'success',
      targetStatus: 'pending',
      reason: null,
    });
    expect(invalidTransition).toEqual({
      ok: false,
      error: 'Transition from success to pending is not allowed.',
    });
  });

  it('validates reopen semantics and builds mutation metadata', () => {
    const reopen = validateReopenRequest({
      currentStatus: 'failure',
      reason: 'Reopening after hotfix deployment and regression verification.',
    });
    expect(reopen).toEqual({
      ok: true,
      toStatus: 'pending',
      reason: 'Reopening after hotfix deployment and regression verification.',
      actionType: 'reopen',
    });

    const blocked = validateReopenRequest({
      currentStatus: 'success',
      reason: 'This should not pass because success is terminal and final.',
    });
    expect(blocked).toEqual({
      ok: false,
      error: 'Only failure, aborted, cancelled missions can be reopened.',
    });

    const now = new Date('2026-04-01T10:00:00.000Z');
    const mutation = buildStatusMutationData({
      current: { startedAt: null, finishedAt: null },
      toStatus: 'ongoing',
      changedBy: 41,
      reason: null,
      now,
    });

    expect(mutation).toEqual({
      status: 'ongoing',
      statusChangedAt: '2026-04-01T10:00:00.000Z',
      statusChangedBy: 41,
      statusReason: null,
      startedAt: '2026-04-01T10:00:00.000Z',
      finishedAt: null,
    });
  });
});
