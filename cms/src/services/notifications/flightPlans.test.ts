import { describe, expect, it, vi } from 'vitest';

import {
  notifyFlightPlanCreated,
  notifyFlightPlanInvitationAccepted,
  notifyFlightPlanInvitationReceived,
  notifyFlightPlanTaskAssignment,
  notifyFlightPlanTaskOwnerChange,
} from './flightPlans';

const makePayload = () => {
  const create = vi.fn().mockResolvedValue({});
  const logger = {
    warn: vi.fn(),
  };
  return { create, logger } as any;
};

describe('flight plan notifications', () => {
  it('sends creation receipt with remaining balance metadata', async () => {
    const payload = makePayload();

    await notifyFlightPlanCreated({
      payload,
      ownerId: 7,
      planSlug: 'alpha',
      planTitle: 'Operation Alpha',
      remainingElsa: 2,
    });

    expect(payload.create).toHaveBeenCalledTimes(1);
    const call = payload.create.mock.calls[0][0];
    expect(call.data.event).toBe('flight_plan_created');
    expect(call.data.recipient).toBe(7);
    expect(call.data.metadata.remainingElsa).toBe(2);
    expect(call.data.message).toContain('Operation Alpha');
  });

  it('formats invite received copy with captain call sign', async () => {
    const payload = makePayload();
    await notifyFlightPlanInvitationReceived({
      payload,
      inviteeId: '12',
      ownerCallsign: 'Captain Flux',
      planSlug: 'beta',
      planTitle: 'Plan Beta',
    });

    const call = payload.create.mock.calls[0][0];
    expect(call.data.event).toBe('flight_plan_invitation_received');
    expect(call.data.recipient).toBe(12);
    expect(call.data.message).toContain('Captain Flux invited you to Plan Beta');
  });

  it('announces accepted invites using crew call sign', async () => {
    const payload = makePayload();
    await notifyFlightPlanInvitationAccepted({
      payload,
      ownerId: 3,
      crewCallsign: 'Navigator Zee',
      planSlug: 'gamma',
      planTitle: 'Mission Gamma',
    });

    const call = payload.create.mock.calls.at(-1)[0];
    expect(call.data.event).toBe('flight_plan_invitation_accepted');
    expect(call.data.recipient).toBe(3);
    expect(call.data.message).toContain('Navigator Zee accepted your invitation');
  });

  it('notifies crew when a task owner changes', async () => {
    const payload = makePayload();

    await notifyFlightPlanTaskOwnerChange({
      payload,
      recipientId: 9,
      planSlug: 'omega',
      planTitle: 'Mission Omega',
      taskTitle: 'Draft telemetry brief',
      actorId: 1,
    });

    const call = payload.create.mock.calls.at(-1)?.[0];
    expect(call.data.event).toBe('flight_plan_task_owner_changed');
    expect(call.data.recipient).toBe(9);
    expect(call.data.metadata.taskTitle).toBe('Draft telemetry brief');
    expect(call.data.actor).toBe(1);
  });

  it('notifies assignees about task assignments', async () => {
    const payload = makePayload();

    await notifyFlightPlanTaskAssignment({
      payload,
      recipientId: '15',
      planSlug: 'omega',
      planTitle: 'Mission Omega',
      taskTitle: 'Stage launch assets',
      actorId: null,
    });

    const call = payload.create.mock.calls.at(-1)?.[0];
    expect(call.data.event).toBe('flight_plan_task_assigned');
    expect(call.data.recipient).toBe(15);
    expect(call.data.message).toContain('Stage launch assets');
    expect(call.data.metadata.planSlug).toBe('omega');
  });
});
