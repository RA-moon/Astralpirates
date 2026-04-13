import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  hasAdminEditOverrideForUser,
  loadMembershipWithOwnerFallback,
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
  membershipIsAcceptedPassenger,
} from '@/app/api/_lib/flightPlanMembers';
import { canUserReadFlightPlan } from '@/app/api/_lib/accessPolicy';
import {
  buildMembershipSummaryMap,
  ensureCrewMembershipForPlan,
  filterCrewAssignableMemberships,
  listTasksForFlightPlan,
  loadTaskById,
  serializeTask,
  membershipMatchesFlightPlan,
} from '@/app/api/_lib/flightPlanTasks';
import {
  ensureViewerMembership,
  normalizeAssigneeIds,
  parseRequestBody,
  sanitizeState,
  sanitizeTitle,
  toLexicalDescription,
} from './helpers';
import { notifyFlightPlanTaskAssignment } from '@/src/services/notifications/flightPlans';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

const METHODS = 'OPTIONS,GET,POST';

type RouteParams = { params: Promise<{ slug: string }> };

const buildTasksEtag = (tasks: Array<{ id: number; version?: number; updatedAt?: string }>): string => {
  const hash = createHash('sha1');
  tasks.forEach((task) => {
    hash.update(`${task.id}:${task.version ?? '1'}:${task.updatedAt ?? ''};`);
  });
  return `"${hash.digest('hex')}"`;
};

export async function GET(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { slug: rawSlug } = await context.params;
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const flightPlanId = normaliseId(flightPlanDoc.id);
  const ownerId = normaliseId((flightPlanDoc as any).owner);
  const publicContributions = Boolean((flightPlanDoc as any)?.publicContributions);
  const planTitle = typeof (flightPlanDoc as any)?.title === 'string' ? (flightPlanDoc as any).title : null;
  if (flightPlanId == null) {
    return corsJson(req, { error: 'Flight plan unavailable.' }, { status: 400 }, METHODS);
  }

  const viewerMembershipHint = auth.user
    ? await loadMembershipWithOwnerFallback({
        payload: auth.payload,
        flightPlanId,
        userId: auth.user.id,
        ownerIdHint: ownerId ?? undefined,
      })
    : null;
  const viewerHasMembership = viewerMembershipHint && viewerMembershipHint.status === 'accepted';
  const viewerIsPassenger = viewerHasMembership && membershipIsAcceptedPassenger(viewerMembershipHint);
  const hasAdminEditOverride = hasAdminEditOverrideForUser({
    userId: auth.user?.id ?? null,
    websiteRole: auth.user?.role ?? null,
    adminMode: auth.adminMode,
  });
  const viewerIsCrew =
    hasAdminEditOverride ||
    (viewerHasMembership &&
      (viewerMembershipHint.role === 'owner' || viewerMembershipHint.role === 'crew'));
  const viewerCanView = canUserReadFlightPlan({
    user: auth.user,
    ownerId,
    membershipRole:
      viewerMembershipHint?.status === 'accepted' ? viewerMembershipHint.role : null,
    policy: (flightPlanDoc as any)?.accessPolicy,
    visibility: (flightPlanDoc as any)?.visibility,
    isPublic: (flightPlanDoc as any)?.isPublic,
    publicContributions: (flightPlanDoc as any)?.publicContributions,
    adminMode: auth.adminMode,
  });

  if (!viewerCanView) {
    return corsJson(
      req,
      { error: 'Crew access required.' },
      { status: auth.user ? 403 : 401 },
      METHODS,
    );
  }

  try {
    const tasks = await listTasksForFlightPlan(auth.payload, flightPlanId);
    if (!tasks.length) {
      return corsJson(req, { tasks: [], total: 0 }, {}, METHODS);
    }
    const membershipIds = new Set<number>();
    tasks.forEach((task) => {
      membershipIds.add(task.ownerMembershipId);
      task.assigneeMembershipIds.forEach((membershipId) => membershipIds.add(membershipId));
    });

    const summaries = await buildMembershipSummaryMap(auth.payload, Array.from(membershipIds));
    const serializedTasks = tasks.map((task) =>
      serializeTask(task, summaries, {
        maskContent: task.isCrewOnly && !viewerIsCrew,
      }),
    );
    const etag = buildTasksEtag(serializedTasks);
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      const response = corsEmpty(req, METHODS, 304);
      response.headers.set('ETag', etag);
      return response;
    }
    const response = corsJson(
      req,
      {
        tasks: serializedTasks,
        total: serializedTasks.length,
        etag,
      },
      {},
      METHODS,
    );
    response.headers.set('ETag', etag);
    response.headers.append('Vary', 'If-None-Match');
    return response;
  } catch (error) {
    auth.payload.logger.error({ err: error, flightPlanId }, '[flight-plan-task] failed to list tasks');
    return corsJson(req, { error: 'Failed to load mission tasks.' }, { status: 500 }, METHODS);
  }
}

export async function POST(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { slug: rawSlug } = await context.params;
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }
  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const flightPlanId = normaliseId(flightPlanDoc.id);
  const ownerId = normaliseId((flightPlanDoc as any).owner);
  const publicContributions = Boolean((flightPlanDoc as any)?.publicContributions);
  const planTitle = typeof (flightPlanDoc as any)?.title === 'string' ? (flightPlanDoc as any).title : null;
  const passengersCanCreateTasks = Boolean(
    (flightPlanDoc as any)?.passengersCanCreateTasks,
  );
  if (flightPlanId == null) {
    return corsJson(req, { error: 'Flight plan unavailable.' }, { status: 400 }, METHODS);
  }

  const viewerMembershipHint = auth.user
    ? await loadMembershipWithOwnerFallback({
        payload: auth.payload,
        flightPlanId,
        userId: auth.user.id,
        ownerIdHint: ownerId ?? undefined,
      })
    : null;
  const viewerCanView = canUserReadFlightPlan({
    user: auth.user,
    ownerId,
    membershipRole:
      viewerMembershipHint?.status === 'accepted' ? viewerMembershipHint.role : null,
    policy: (flightPlanDoc as any)?.accessPolicy,
    visibility: (flightPlanDoc as any)?.visibility,
    isPublic: (flightPlanDoc as any)?.isPublic,
    publicContributions: (flightPlanDoc as any)?.publicContributions,
    adminMode: auth.adminMode,
  });
  if (!viewerCanView) {
    return corsJson(
      req,
      { error: 'Crew access required.' },
      { status: auth.user ? 403 : 401 },
      METHODS,
    );
  }

  const viewerResult = await ensureViewerMembership({
    req,
    auth,
    flightPlanId,
    ownerId,
    methods: METHODS,
    allowGuest: passengersCanCreateTasks,
  });
  if ('response' in viewerResult) return viewerResult.response;
  const viewerMembership = viewerResult.membership;
  const viewerIsContributionCrew =
    publicContributions &&
    viewerMembership.role === 'crew' &&
    viewerMembership.invitedById != null &&
    viewerMembership.invitedById === viewerMembership.userId;
  if (viewerIsContributionCrew) {
    return corsJson(
      req,
      { error: 'Contributors can claim tasks but cannot create new ones.' },
      { status: 403 },
      METHODS,
    );
  }

  const body = await parseRequestBody(req);
  const title = sanitizeTitle(body.title);
  if (!title) {
    return corsJson(req, { error: 'Task title is required.' }, { status: 400 }, METHODS);
  }

  const descriptionDoc = toLexicalDescription(body.description);
  const state = sanitizeState(body.state);
  const requestedAssignees = normalizeAssigneeIds(body.assigneeMembershipIds);
  const isCrewOnly = Boolean(body.isCrewOnly);

  try {
    const membershipIds = Array.from(new Set([viewerMembership.id, ...requestedAssignees]));
    const summaries = await buildMembershipSummaryMap(auth.payload, membershipIds);
    const ownerRecord = summaries.membershipMap.get(viewerMembership.id);
    const ownerIsCrew = ensureCrewMembershipForPlan(ownerRecord, flightPlanId);
    const ownerIsPassenger =
      passengersCanCreateTasks &&
      membershipMatchesFlightPlan(ownerRecord, flightPlanId) &&
      membershipIsAcceptedPassenger(ownerRecord);
    if (!ownerIsCrew && !ownerIsPassenger) {
      return corsJson(
        req,
        { error: 'Owner must be accepted crew or an approved passenger when passenger tasks are enabled.' },
        { status: 400 },
        METHODS,
      );
    }

    const validAssignees = filterCrewAssignableMemberships(
      summaries.membershipMap,
      requestedAssignees,
    ).filter((membershipId) =>
      ensureCrewMembershipForPlan(summaries.membershipMap.get(membershipId), flightPlanId),
    );

    const created = await auth.payload.create({
      collection: 'flight-plan-tasks',
      data: {
        flightPlan: flightPlanId,
        ownerMembership: viewerMembership.id,
        title,
        description: descriptionDoc as any,
        state,
        listOrder: Date.now(),
        assigneeMembershipIds: validAssignees,
        isCrewOnly,
        version: 1,
      },
      draft: false,
      overrideAccess: true,
    });

    const createdRecord = await loadTaskById(auth.payload, normaliseId(created.id) ?? 0);
    if (!createdRecord) {
      return corsJson(req, { error: 'Failed to create mission task.' }, { status: 500 }, METHODS);
    }

    if (validAssignees.length) {
      const assignments = validAssignees
        .map((membershipId) => {
          const membership = summaries.membershipMap.get(membershipId);
          const recipientId = membership?.userId;
          if (!recipientId || recipientId === viewerMembership.userId) {
            return null;
          }
          return notifyFlightPlanTaskAssignment({
            payload: auth.payload,
            recipientId,
            planSlug: slug,
            planTitle,
            taskTitle: createdRecord.title,
            actorId: auth.user?.id ?? null,
          });
        })
        .filter(Boolean) as Promise<void>[];
      if (assignments.length) {
        await Promise.all(assignments);
      }
    }

    const viewerIsCrew =
      viewerMembership.role === 'owner' || viewerMembership.role === 'crew';
    const serialized = serializeTask(createdRecord, summaries, {
      maskContent: createdRecord.isCrewOnly && !viewerIsCrew,
    });

    await publishTaskEvent({
      payload: auth.payload,
      event: createTaskEvent({
        flightPlanId,
        taskId: createdRecord.id,
        type: 'task-created',
        version: createdRecord.version,
        task: serialized,
      }),
    });

    return corsJson(req, { task: serialized }, { status: 201 }, METHODS);
  } catch (error) {
    auth.payload.logger.error({ err: error, flightPlanId }, '[flight-plan-task] failed to create task');
    return corsJson(req, { error: 'Failed to create mission task.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
