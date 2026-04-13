import type { Payload } from 'payload';

import { safeCreateNotification } from './index';

const formatPlanUrl = (slug?: string | null): string | null => {
  if (!slug) return null;
  return `/flight-plans/${slug}`;
};

const toPlanTitle = (title?: string | null, fallback = 'your mission'): string =>
  typeof title === 'string' && title.trim().length ? title : fallback;

const toCallSign = (callSign?: string | null, fallback = 'your captain'): string =>
  typeof callSign === 'string' && callSign.trim().length ? callSign : fallback;

type NotifyContext = {
  payload: Payload;
  planSlug?: string | null;
  planTitle?: string | null;
};

export const notifyFlightPlanCreated = async ({
  payload,
  ownerId,
  planSlug,
  planTitle,
  remainingElsa,
}: NotifyContext & {
  ownerId: number | string;
  remainingElsa: number;
}) =>
  safeCreateNotification({
    payload,
    event: 'flight_plan_created',
    recipientId: ownerId,
    message: `You spent 1 E.L.S.A. to chart “${toPlanTitle(planTitle)}”. Keep an eye on your roster for replies.`,
    metadata: {
      planSlug,
      planTitle,
      remainingElsa,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'View mission',
  });

export const notifyFlightPlanInvitationReceived = async ({
  payload,
  inviteeId,
  ownerCallsign,
  planSlug,
  planTitle,
}: NotifyContext & {
  inviteeId: number | string;
  ownerCallsign?: string | null;
}) =>
  safeCreateNotification({
    payload,
    event: 'flight_plan_invitation_received',
    recipientId: inviteeId,
    message: `Captain ${toCallSign(ownerCallsign)} invited you to ${toPlanTitle(
      planTitle,
      'a mission',
    )}. Accept the mission or decline from your Crew Quarters.`,
    metadata: {
      planSlug,
      planTitle,
      ownerCallsign,
    },
    ctaUrl: '/gangway/crew-quarters/invitations',
    ctaLabel: 'Review invites',
  });

export const notifyFlightPlanInvitationAccepted = async ({
  payload,
  ownerId,
  crewCallsign,
  planSlug,
  planTitle,
}: NotifyContext & {
  ownerId: number | string;
  crewCallsign?: string | null;
}) =>
  safeCreateNotification({
    payload,
    event: 'flight_plan_invitation_accepted',
    recipientId: ownerId,
    message: `${toCallSign(crewCallsign, 'A crew member')} accepted your invitation to ${toPlanTitle(
      planTitle,
    )}.`,
    metadata: {
      planSlug,
      planTitle,
      crewCallsign,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'Open mission',
  });

export const notifyFlightPlanPromotion = async ({
  payload,
  memberId,
  planSlug,
  planTitle,
}: NotifyContext & { memberId: number | string }) =>
  safeCreateNotification({
    payload,
    event: 'flight_plan_membership_promoted',
    recipientId: memberId,
    message: `You were promoted to Crew Organiser on “${toPlanTitle(planTitle)}”.`,
    metadata: {
      planSlug,
      planTitle,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'Return to mission',
  });

export const notifyFlightPlanTaskOwnerChange = async ({
  payload,
  recipientId,
  planSlug,
  planTitle,
  taskTitle,
  actorId,
}: NotifyContext & {
  recipientId: number | string;
  taskTitle: string;
  actorId?: number | string | null;
}) =>
  safeCreateNotification({
    payload,
    event: 'flight_plan_task_owner_changed',
    recipientId,
    actorId,
    message: `You now own “${taskTitle}” on ${toPlanTitle(planTitle)}.`,
    metadata: {
      planSlug,
      planTitle,
      taskTitle,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'Review task',
  });

export const notifyFlightPlanTaskAssignment = async ({
  payload,
  recipientId,
  planSlug,
  planTitle,
  taskTitle,
  actorId,
}: NotifyContext & {
  recipientId: number | string;
  taskTitle: string;
  actorId?: number | string | null;
}) =>
  safeCreateNotification({
    payload,
    event: 'flight_plan_task_assigned',
    recipientId,
    actorId,
    message: `You were assigned to “${taskTitle}” on ${toPlanTitle(planTitle)}.`,
    metadata: {
      planSlug,
      planTitle,
      taskTitle,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'Open mission',
  });

export const notifyFlightPlanTaskMention = async ({
  payload,
  recipientId,
  planSlug,
  planTitle,
  taskTitle,
  actorId,
}: NotifyContext & {
  recipientId: number | string | null | undefined;
  taskTitle?: string | null;
  actorId?: number | string | null;
}) => {
  const targetId = recipientId ?? null;
  if (targetId == null) return;
  return safeCreateNotification({
    payload,
    event: 'flight_plan_task_mention',
    recipientId: targetId,
    actorId,
    message: `You were mentioned on “${taskTitle ?? 'a mission task'}” for ${toPlanTitle(planTitle)}.`,
    metadata: {
      planSlug,
      planTitle,
      taskTitle,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'Open task',
  });
};

export const enqueueFlightPlanTaskDigest = async ({
  payload,
  recipientId,
  planSlug,
  planTitle,
  taskTitle,
  reason,
}: NotifyContext & {
  recipientId: number | string | null | undefined;
  taskTitle?: string | null;
  reason?: string | null;
}) => {
  const targetId = recipientId ?? null;
  if (targetId == null) return;
  return safeCreateNotification({
    payload,
    event: 'flight_plan_task_digest',
    recipientId: targetId,
    message: `${reason ?? 'Task update'} for ${toPlanTitle(planTitle)} — ${taskTitle ?? 'mission task'}`,
    metadata: {
      planSlug,
      planTitle,
      taskTitle,
      digest: true,
      reason,
    },
    ctaUrl: formatPlanUrl(planSlug),
    ctaLabel: 'View task',
  });
};
