import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  loadMembershipsByIds,
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
  membershipIsAcceptedPassenger,
  ensureCrewMembership,
  ensureOwnerMembership,
  loadMembershipWithOwnerFallback,
} from '@/app/api/_lib/flightPlanMembers';
import {
  buildMembershipSummaryMap,
  ensureCrewMembershipForPlan,
  filterCrewAssignableMemberships,
  loadTaskById,
  membershipMatchesFlightPlan,
  serializeTask,
} from '@/app/api/_lib/flightPlanTasks';
import {
  ensureViewerMembership,
  normalizeAssigneeIds,
  parseRequestBody,
  sanitizeState,
  sanitizeTitle,
  toLexicalDescription,
} from '../helpers';
import {
  notifyFlightPlanTaskAssignment,
  notifyFlightPlanTaskOwnerChange,
} from '@/src/services/notifications/flightPlans';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

const METHODS = 'OPTIONS,PATCH,DELETE';

type RouteParams = { params: Promise<{ slug: string; taskId: string }> };

const ensureTaskContext = async (
  req: NextRequest,
  auth: Awaited<ReturnType<typeof authenticateRequest>>,
  slug: string,
  taskIdValue: string,
) => {
  const flightPlanSlug = sanitizeFlightPlanSlug(slug);
  if (!flightPlanSlug) {
    return {
      response: corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS),
    };
  }

  const taskId = normaliseId(taskIdValue);
  if (taskId == null) {
    return {
      response: corsJson(req, { error: 'Invalid task id.' }, { status: 400 }, METHODS),
    };
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, flightPlanSlug);
  if (!flightPlanDoc) {
    return {
      response: corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS),
    };
  }

  const flightPlanId = normaliseId(flightPlanDoc.id);
  const ownerId = normaliseId((flightPlanDoc as any).owner);
  const publicContributions = Boolean((flightPlanDoc as any)?.publicContributions);
  const passengersCanCreateTasks = Boolean(
    (flightPlanDoc as any)?.passengersCanCreateTasks,
  );
  if (flightPlanId == null) {
    return {
      response: corsJson(req, { error: 'Flight plan unavailable.' }, { status: 400 }, METHODS),
    };
  }

  const taskRecord = await loadTaskById(auth.payload, taskId);
  if (!taskRecord || taskRecord.flightPlanId !== flightPlanId) {
    return {
      response: corsJson(req, { error: 'Mission task not found.' }, { status: 404 }, METHODS),
    };
  }

  return {
    flightPlanId,
    ownerId,
    planSlug: flightPlanSlug,
    planTitle: typeof (flightPlanDoc as any)?.title === 'string' ? (flightPlanDoc as any).title : null,
    passengersCanCreateTasks,
    publicContributions,
    task: taskRecord,
  };
};

export async function PATCH(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { slug, taskId } = await context.params;
  const preflight = await ensureTaskContext(req, auth, slug, taskId);
  if ('response' in preflight) return preflight.response;

  const viewerMembership = auth.user
    ? await loadMembershipWithOwnerFallback({
        payload: auth.payload,
        flightPlanId: preflight.flightPlanId,
        userId: auth.user.id,
        ownerIdHint: preflight.ownerId ?? undefined,
      })
    : null;
  const viewerIsCrew = viewerMembership
    ? ensureCrewMembershipForPlan(viewerMembership, preflight.flightPlanId)
    : false;
  const viewerIsContributionCrew =
    preflight.publicContributions &&
    viewerMembership?.role === 'crew' &&
    viewerMembership?.invitedById != null &&
    viewerMembership.invitedById === viewerMembership.userId;
  const viewerIsCrewMember = Boolean(viewerMembership) && viewerIsCrew && !viewerIsContributionCrew;
  const viewerIsPassengerOwner =
    preflight.passengersCanCreateTasks &&
    membershipMatchesFlightPlan(viewerMembership, preflight.flightPlanId) &&
    membershipIsAcceptedPassenger(viewerMembership) &&
    viewerMembership?.id === preflight.task.ownerMembershipId;
  const contributionsEnabled = preflight.publicContributions && Boolean(auth.user);
  const viewerIsContributor =
    contributionsEnabled &&
    (viewerIsContributionCrew || (!viewerIsCrewMember && !viewerIsPassengerOwner));
  if (!viewerIsCrewMember && !viewerIsPassengerOwner && !viewerIsContributor) {
    return corsJson(
      req,
      { error: 'Only captains, crew organisers, or contributors on this mission can update tasks.' },
      { status: auth.user ? 403 : 401 },
      METHODS,
    );
  }

  const body = await parseRequestBody(req);
  const updates: Record<string, unknown> = {};
  let changed = false;
  const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';

  if (viewerIsContributor) {
    if (action !== 'claim' && action !== 'unclaim') {
      return corsJson(
        req,
        { error: 'Contributors can only claim or unclaim tasks.' },
        { status: 403 },
        METHODS,
      );
    }
  } else {
    if ('title' in body) {
      const nextTitle = sanitizeTitle(body.title);
      if (!nextTitle) {
        return corsJson(req, { error: 'Task title cannot be empty.' }, { status: 400 }, METHODS);
      }
      updates.title = nextTitle;
      changed = true;
    }

    if ('description' in body) {
      updates.description = toLexicalDescription(body.description) as any;
      changed = true;
    }

    if ('state' in body) {
      const nextState = sanitizeState(body.state);
      updates.state = nextState;
      changed = true;
      if (!('listOrder' in updates) && nextState !== preflight.task.state) {
        updates.listOrder = Date.now();
      }
    }

    if ('listOrder' in body) {
      const order = typeof body.listOrder === 'number' ? body.listOrder : Number(body.listOrder);
      if (!Number.isFinite(order)) {
        return corsJson(req, { error: 'Invalid list order value.' }, { status: 400 }, METHODS);
      }
      updates.listOrder = order;
      changed = true;
    }

    if ('isCrewOnly' in body) {
      updates.isCrewOnly = Boolean(body.isCrewOnly);
      changed = true;
    }
  }

  let nextOwnerId: number | null = null;
  let requestedAssignees: number[] | null = null;
  let previousState: string | null = preflight.task.state;

  if (viewerIsContributor) {
    const contributorMembership = await ensureCrewMembership({
      payload: auth.payload,
      flightPlanId: preflight.flightPlanId,
      userId: auth.user?.id ?? null,
      inviterId: auth.user?.id ?? preflight.ownerId ?? null,
    });
    if (!contributorMembership || contributorMembership.flightPlanId !== preflight.flightPlanId) {
      return corsJson(
        req,
        { error: 'Unable to enrol as a contributor on this mission.' },
        { status: 403 },
        METHODS,
      );
    }

    if (action === 'claim') {
      nextOwnerId = contributorMembership.id;
      requestedAssignees = Array.from(
        new Set([...preflight.task.assigneeMembershipIds, contributorMembership.id]),
      );
      changed = true;
    } else if (action === 'unclaim') {
      if (preflight.task.ownerMembershipId !== contributorMembership.id) {
        return corsJson(
          req,
          { error: 'You can only unclaim tasks you currently own.' },
          { status: 400 },
          METHODS,
        );
      }
      const ownerMembership =
        (await ensureOwnerMembership({
          payload: auth.payload,
          flightPlanId: preflight.flightPlanId,
          ownerId: preflight.ownerId ?? contributorMembership.userId,
        })) ?? null;
      nextOwnerId = ownerMembership?.id ?? contributorMembership.id;
      requestedAssignees = preflight.task.assigneeMembershipIds.filter(
        (id) => id !== contributorMembership.id,
      );
      changed = true;
    }
  } else {
    if ('ownerMembershipId' in body) {
      nextOwnerId = normaliseId(body.ownerMembershipId);
      if (nextOwnerId == null) {
        return corsJson(req, { error: 'Invalid owner membership id.' }, { status: 400 }, METHODS);
      }
      if (viewerMembership?.id !== preflight.task.ownerMembershipId) {
        return corsJson(req, { error: 'Only the current task owner can reassign ownership.' }, { status: 403 }, METHODS);
      }
    }

    if ('assigneeMembershipIds' in body) {
      requestedAssignees = normalizeAssigneeIds(body.assigneeMembershipIds);
    }
  }

  if (!changed && nextOwnerId == null && requestedAssignees == null) {
    const summaries = await buildMembershipSummaryMap(
      auth.payload,
      [preflight.task.ownerMembershipId, ...preflight.task.assigneeMembershipIds],
    );
    return corsJson(
      req,
      {
        task: serializeTask(preflight.task, summaries, {
          maskContent: preflight.task.isCrewOnly && !viewerIsCrewMember,
        }),
      },
      {},
      METHODS,
    );
  }

  const membershipIdsToValidate = new Set<number>([
    preflight.task.ownerMembershipId,
  ]);
  if (viewerMembership?.id != null) membershipIdsToValidate.add(viewerMembership.id);
  if (nextOwnerId != null) membershipIdsToValidate.add(nextOwnerId);
  if (requestedAssignees) {
    requestedAssignees.forEach((id) => membershipIdsToValidate.add(id));
  }

  const membershipMap = await loadMembershipsByIds(auth.payload, Array.from(membershipIdsToValidate));

  if (nextOwnerId != null) {
    const nextOwnerRecord = membershipMap.get(nextOwnerId);
    if (!ensureCrewMembershipForPlan(nextOwnerRecord, preflight.flightPlanId)) {
      return corsJson(req, { error: 'New owner must be an accepted captain or crew organiser on this mission.' }, { status: 400 }, METHODS);
    }
    updates.ownerMembership = nextOwnerId;
    changed = true;
  }

  if (requestedAssignees) {
    const validAssignees = filterCrewAssignableMemberships(membershipMap, requestedAssignees).filter(
      (membershipId) =>
        membershipMatchesFlightPlan(membershipMap.get(membershipId), preflight.flightPlanId),
    );
    updates.assigneeMembershipIds = validAssignees;
    changed = true;
  }

  if (!changed) {
    const summaries = await buildMembershipSummaryMap(
      auth.payload,
      [preflight.task.ownerMembershipId, ...preflight.task.assigneeMembershipIds],
    );
    return corsJson(
      req,
      {
        task: serializeTask(preflight.task, summaries, {
          maskContent: preflight.task.isCrewOnly && !viewerIsCrewMember,
        }),
      },
      {},
      METHODS,
    );
  }

  updates.version = (preflight.task.version ?? 1) + 1;

  await auth.payload.update({
    collection: 'flight-plan-tasks',
    id: preflight.task.id,
    data: updates,
    overrideAccess: true,
  });

  const updatedRecord = await loadTaskById(auth.payload, preflight.task.id);
  if (!updatedRecord) {
    return corsJson(req, { error: 'Failed to update mission task.' }, { status: 500 }, METHODS);
  }

  const updatedSummaries = await buildMembershipSummaryMap(
    auth.payload,
    [updatedRecord.ownerMembershipId, ...updatedRecord.assigneeMembershipIds],
  );

  const notifications: Promise<void>[] = [];
  const updatedMembershipMap = updatedSummaries.membershipMap;
  const actorId = auth.user?.id ?? null;

  if (updatedRecord.ownerMembershipId !== preflight.task.ownerMembershipId) {
    const nextOwner = updatedMembershipMap.get(updatedRecord.ownerMembershipId);
    const recipientId = nextOwner?.userId;
    if (recipientId && recipientId !== actorId) {
      notifications.push(
        notifyFlightPlanTaskOwnerChange({
          payload: auth.payload,
          recipientId,
          planSlug: preflight.planSlug,
          planTitle: preflight.planTitle,
          taskTitle: updatedRecord.title,
          actorId,
        }),
      );
    }
  }

  if (requestedAssignees) {
    const previousAssignees = new Set(preflight.task.assigneeMembershipIds);
    updatedRecord.assigneeMembershipIds.forEach((membershipId) => {
      if (previousAssignees.has(membershipId)) return;
      const membership = updatedMembershipMap.get(membershipId);
      const recipientId = membership?.userId;
      if (!recipientId || recipientId === actorId) return;
      notifications.push(
        notifyFlightPlanTaskAssignment({
          payload: auth.payload,
          recipientId,
          planSlug: preflight.planSlug,
          planTitle: preflight.planTitle,
          taskTitle: updatedRecord.title,
          actorId,
        }),
      );
    });
  }

  if (notifications.length) {
    await Promise.all(notifications);
  }

  const serialized = serializeTask(updatedRecord, updatedSummaries, {
    maskContent: updatedRecord.isCrewOnly && !viewerIsCrewMember,
  });

  await publishTaskEvent({
    payload: auth.payload,
    event: createTaskEvent({
      flightPlanId: preflight.flightPlanId,
      taskId: updatedRecord.id,
      type: previousState && previousState !== updatedRecord.state ? 'task-moved' : 'task-updated',
      previousState,
      version: updatedRecord.version,
      task: serialized,
    }),
  });

  return corsJson(req, { task: serialized }, {}, METHODS);
}

export async function DELETE(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { slug, taskId } = await context.params;
  const preflight = await ensureTaskContext(req, auth, slug, taskId);
  if ('response' in preflight) return preflight.response;

  const viewerResult = await ensureViewerMembership({
    req,
    auth,
    flightPlanId: preflight.flightPlanId,
    ownerId: preflight.ownerId,
    methods: METHODS,
    allowGuest: preflight.passengersCanCreateTasks,
  });
  if ('response' in viewerResult) return viewerResult.response;
  const viewerMembership = viewerResult.membership;
  const viewerIsContributionCrew =
    preflight.publicContributions &&
    viewerMembership.role === 'crew' &&
    viewerMembership.invitedById != null &&
    viewerMembership.invitedById === viewerMembership.userId;
  if (viewerIsContributionCrew) {
    return corsJson(
      req,
      { error: 'Contributors can unclaim tasks but cannot delete them.' },
      { status: 403 },
      METHODS,
    );
  }
  const viewerIsCrew = ensureCrewMembershipForPlan(viewerMembership, preflight.flightPlanId);
  const viewerIsPassengerOwner =
    preflight.passengersCanCreateTasks &&
    membershipMatchesFlightPlan(viewerMembership, preflight.flightPlanId) &&
    membershipIsAcceptedPassenger(viewerMembership) &&
    viewerMembership.id === preflight.task.ownerMembershipId;
  if (!viewerIsCrew && !viewerIsPassengerOwner) {
    return corsJson(
      req,
      { error: 'Only captains, crew organisers, or the task owner can delete tasks.' },
      { status: 403 },
      METHODS,
    );
  }

  const canDelete =
    viewerMembership.role === 'owner' ||
    viewerMembership.id === preflight.task.ownerMembershipId;
  if (!canDelete) {
    return corsJson(req, { error: 'Only captains or task owners can delete tasks.' }, { status: 403 }, METHODS);
  }

  await auth.payload.delete({
    collection: 'flight-plan-tasks',
    id: preflight.task.id,
    overrideAccess: true,
  });

  await publishTaskEvent({
    payload: auth.payload,
    event: createTaskEvent({
      flightPlanId: preflight.flightPlanId,
      taskId: preflight.task.id,
      type: 'task-deleted',
      version: preflight.task.version,
    }),
  });

  return new Response(null, { status: 204 });
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
