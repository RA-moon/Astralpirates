import type { Payload } from 'payload';

import type { AuthContext } from '../auth';
import {
  loadMembershipWithOwnerFallback,
  membershipIsAcceptedCrew,
  membershipIsAcceptedPassenger,
  normaliseId,
} from '../flightPlanMembers';
import type { CommentThreadRecord, ThreadPermissions } from './types';
import { loadTaskById } from '../flightPlanTasks';

export const COMMENT_RESOURCE_TYPES = {
  FLIGHT_PLAN_TASK: 'flight-plan-task',
} as const;

type PolicyResolution =
  | {
      ok: true;
      policy: ThreadPermissions;
      thread?: CommentThreadRecord | null;
      resourceId: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const loadFlightPlanMeta = async (payload: Payload, flightPlanId: number) => {
  try {
    const doc = (await payload.findByID({
      collection: 'flight-plans',
      id: flightPlanId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>;
    return {
      ownerId: normaliseId((doc as { owner?: unknown }).owner),
      publicContributions: Boolean((doc as { publicContributions?: unknown }).publicContributions),
      passengersCanCreateTasks: Boolean(
        (doc as { passengersCanCreateTasks?: unknown }).passengersCanCreateTasks,
      ),
      passengersCanCommentOnTasks: Boolean(
        (doc as { passengersCanCommentOnTasks?: unknown }).passengersCanCommentOnTasks,
      ),
      title: typeof (doc as { title?: unknown }).title === 'string' ? (doc as { title?: string }).title : null,
      slug: typeof (doc as { slug?: unknown }).slug === 'string' ? (doc as { slug?: string }).slug : null,
    };
  } catch (error) {
    payload.logger?.warn?.({ err: error, flightPlanId }, '[comments] failed to load flight plan meta');
    return null;
  }
};

const resolveFlightPlanTaskPolicy = async ({
  auth,
  resourceId,
}: {
  auth: AuthContext;
  resourceId: number;
}): Promise<PolicyResolution> => {
  const task = await loadTaskById(auth.payload, resourceId);
  if (!task) {
    return { ok: false, status: 404, error: 'Mission task not found.' };
  }

  const planMeta = await loadFlightPlanMeta(auth.payload, task.flightPlanId);
  if (!planMeta) {
    return { ok: false, status: 400, error: 'Mission unavailable.' };
  }

  const viewerMembership = auth.user
    ? await loadMembershipWithOwnerFallback({
        payload: auth.payload,
        flightPlanId: task.flightPlanId,
        userId: auth.user.id,
        ownerIdHint: planMeta.ownerId ?? undefined,
      })
    : null;

  const viewerIsCrew = membershipIsAcceptedCrew(viewerMembership);
  const viewerIsPassenger = membershipIsAcceptedPassenger(viewerMembership);

  if (task.isCrewOnly && !viewerIsCrew) {
    return {
      ok: false,
      status: auth.user ? 403 : 401,
      error: 'Crew access required.',
    };
  }

  const viewerCanView =
    viewerIsCrew || viewerIsPassenger || (planMeta.publicContributions && Boolean(auth.user));

  if (!viewerCanView) {
    return {
      ok: false,
      status: auth.user ? 403 : 401,
      error: 'Crew access required.',
    };
  }

  const canComment = viewerIsCrew || (viewerIsPassenger && planMeta.passengersCanCommentOnTasks);
  const canVote = canComment;
  const canModerate = viewerIsCrew;

  return {
    ok: true,
    policy: {
      canView: true,
      canComment,
      canVote,
      canModerate,
      defaultSort: 'best',
      resourceLabel: planMeta.title,
    },
    resourceId: task.id,
  };
};

export const resolveCommentPolicy = async ({
  auth,
  resourceType,
  resourceId,
  thread,
}: {
  auth: AuthContext;
  resourceType: string;
  resourceId: number;
  thread?: CommentThreadRecord | null;
}): Promise<PolicyResolution> => {
  switch (resourceType) {
    case COMMENT_RESOURCE_TYPES.FLIGHT_PLAN_TASK:
      return resolveFlightPlanTaskPolicy({ auth, resourceId });
    default:
      return { ok: false, status: 400, error: 'Unsupported comment resource.' };
  }
};
