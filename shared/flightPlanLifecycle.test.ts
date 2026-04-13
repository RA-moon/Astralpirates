import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FLIGHT_PLAN_REOPEN_TARGET_STATUS,
  canTransitionFlightPlanLifecycleStatus,
  deriveFlightPlanLifecycleBucket,
  getAllowedFlightPlanLifecycleTransitions,
  isFlightPlanLifecycleReopenableStatus,
  isFlightPlanLifecycleTerminalStatus,
  normaliseFlightPlanLifecycleBucket,
  normaliseFlightPlanLifecycleStatus,
  shouldRequireReasonForFlightPlanTransition,
  validateFlightPlanStatusReason,
} from './flightPlanLifecycle';

describe('flightPlanLifecycle', () => {
  it('normalises canonical and aliased statuses', () => {
    assert.deepEqual(normaliseFlightPlanLifecycleStatus('ongoing'), {
      status: 'ongoing',
      normalizedFromAlias: false,
      original: 'ongoing',
    });

    assert.deepEqual(normaliseFlightPlanLifecycleStatus('  canceled '), {
      status: 'cancelled',
      normalizedFromAlias: true,
      original: 'canceled',
    });

    assert.deepEqual(normaliseFlightPlanLifecycleStatus('on_hold'), {
      status: 'on-hold',
      normalizedFromAlias: true,
      original: 'on_hold',
    });

    assert.equal(normaliseFlightPlanLifecycleStatus('invalid-status'), null);
  });

  it('returns transition matrix and validates allowed transitions', () => {
    assert.deepEqual(getAllowedFlightPlanLifecycleTransitions('planned'), [
      'pending',
      'ongoing',
      'on-hold',
      'postponed',
      'cancelled',
    ]);

    assert.equal(
      canTransitionFlightPlanLifecycleStatus({
        fromStatus: 'ongoing',
        toStatus: 'success',
      }),
      true,
    );

    assert.equal(
      canTransitionFlightPlanLifecycleStatus({
        fromStatus: 'success',
        toStatus: 'pending',
      }),
      false,
    );
  });

  it('derives status buckets', () => {
    assert.equal(deriveFlightPlanLifecycleBucket('ongoing'), 'active');
    assert.equal(deriveFlightPlanLifecycleBucket('failure'), 'finished');
    assert.equal(deriveFlightPlanLifecycleBucket('planned'), 'archived');

    assert.equal(normaliseFlightPlanLifecycleBucket(' finished '), 'finished');
    assert.equal(normaliseFlightPlanLifecycleBucket('invalid'), null);
  });

  it('exposes terminal and reopenable helpers', () => {
    assert.equal(isFlightPlanLifecycleTerminalStatus('success'), true);
    assert.equal(isFlightPlanLifecycleTerminalStatus('ongoing'), false);

    assert.equal(isFlightPlanLifecycleReopenableStatus('failure'), true);
    assert.equal(isFlightPlanLifecycleReopenableStatus('success'), false);
    assert.equal(FLIGHT_PLAN_REOPEN_TARGET_STATUS, 'pending');
  });

  it('applies reason-required rules and validation bounds', () => {
    assert.equal(
      shouldRequireReasonForFlightPlanTransition({
        action: 'transition',
        targetStatus: 'on-hold',
      }),
      true,
    );

    assert.equal(
      shouldRequireReasonForFlightPlanTransition({
        action: 'transition',
        targetStatus: 'planned',
      }),
      false,
    );

    assert.equal(
      shouldRequireReasonForFlightPlanTransition({
        action: 'reopen',
        targetStatus: 'pending',
      }),
      true,
    );

    const requiredMissing = validateFlightPlanStatusReason({
      reason: '   ',
      required: true,
    });
    assert.equal(requiredMissing.ok, false);

    const tooShort = validateFlightPlanStatusReason({
      reason: 'too short',
      required: true,
    });
    assert.equal(tooShort.ok, false);

    const valid = validateFlightPlanStatusReason({
      reason: 'Mission paused due to blocked release dependency.',
      required: true,
    });
    assert.deepEqual(valid, {
      ok: true,
      reason: 'Mission paused due to blocked release dependency.',
    });

    const optionalEmpty = validateFlightPlanStatusReason({
      reason: null,
      required: false,
    });
    assert.deepEqual(optionalEmpty, {
      ok: true,
      reason: null,
    });
  });
});
