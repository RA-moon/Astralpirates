import type { Payload } from 'payload';

import { loadTaskById } from '../flightPlanTasks';
import { loadFlightPlanSummary, normaliseId } from '../flightPlanMembers';
import type { CommentThreadRecord } from './types';

const MENTION_PATTERN = /(^|[^a-z0-9._-])@([a-z0-9][a-z0-9._-]{1,63})/gi;

type MentionCandidate = {
  membershipId: number;
  userId: number;
  handles: string[];
};

type MentionResolutionResult = {
  mentionMembershipIds: number[];
  mentionUserIds: number[];
  taskId: number | null;
  taskVersion: number | null;
  taskIsCrewOnly: boolean | null;
  taskTitle: string | null;
  flightPlanId: number | null;
  planSlug: string | null;
  planTitle: string | null;
};

const normalizeHandle = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const extractHandles = (body: string): string[] => {
  const matches = new Set<string>();
  MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = MENTION_PATTERN.exec(body);
  while (match) {
    const handle = normalizeHandle(match[2]);
    if (handle) matches.add(handle);
    match = MENTION_PATTERN.exec(body);
  }
  return Array.from(matches);
};

const parseMentionMembershipIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<number>();
  value.forEach((entry) => {
    const id = normaliseId(entry);
    if (id != null) ids.add(id);
  });
  return Array.from(ids);
};

const buildHandleList = (user: Record<string, unknown> | null): string[] => {
  if (!user) return [];
  const handles = new Set<string>();
  const callSign = normalizeHandle(user.callSign);
  const profileSlug = normalizeHandle(user.profileSlug);
  if (callSign) handles.add(callSign);
  if (profileSlug) handles.add(profileSlug);
  return Array.from(handles);
};

const buildMentionCandidates = async (
  payload: Payload,
  flightPlanId: number,
): Promise<MentionCandidate[]> => {
  const memberships = await payload.find({
    collection: 'flight-plan-memberships',
    where: {
      and: [
        {
          flightPlan: {
            equals: flightPlanId,
          },
        },
        {
          invitationStatus: {
            equals: 'accepted',
          },
        },
      ],
    },
    pagination: false,
    depth: 1,
    overrideAccess: true,
  });

  const candidates: MentionCandidate[] = [];
  memberships.docs.forEach((doc) => {
    const record = doc as unknown as Record<string, unknown>;
    const membershipId = normaliseId(record.id);
    const userId = normaliseId(record.user);
    if (membershipId == null || userId == null) return;
    const user = typeof record.user === 'object' && record.user ? (record.user as Record<string, unknown>) : null;
    candidates.push({
      membershipId,
      userId,
      handles: buildHandleList(user),
    });
  });

  return candidates;
};

export const resolveCommentMentions = async ({
  payload,
  thread,
  rawBody,
  rawMentionMembershipIds,
}: {
  payload: Payload;
  thread: CommentThreadRecord;
  rawBody: string;
  rawMentionMembershipIds: unknown;
}): Promise<MentionResolutionResult> => {
  if (thread.resourceType !== 'flight-plan-task') {
    return {
      mentionMembershipIds: [],
      mentionUserIds: [],
      taskId: null,
      taskVersion: null,
      taskIsCrewOnly: null,
      taskTitle: null,
      flightPlanId: null,
      planSlug: null,
      planTitle: null,
    };
  }

  const task = await loadTaskById(payload, thread.resourceId);
  if (!task) {
    return {
      mentionMembershipIds: [],
      mentionUserIds: [],
      taskId: null,
      taskVersion: null,
      taskIsCrewOnly: null,
      taskTitle: null,
      flightPlanId: null,
      planSlug: null,
      planTitle: null,
    };
  }

  const planSummary = await loadFlightPlanSummary(payload, task.flightPlanId);
  const candidates = await buildMentionCandidates(payload, task.flightPlanId);
  const candidateByMembership = new Map<number, MentionCandidate>();
  const membershipByHandle = new Map<string, number | null>();
  candidates.forEach((candidate) => {
    candidateByMembership.set(candidate.membershipId, candidate);
    candidate.handles.forEach((handle) => {
      const existing = membershipByHandle.get(handle);
      if (existing == null) {
        membershipByHandle.set(handle, candidate.membershipId);
        return;
      }
      if (existing !== candidate.membershipId) {
        membershipByHandle.set(handle, null);
      }
    });
  });

  const mentionMembershipIds = new Set<number>();
  parseMentionMembershipIds(rawMentionMembershipIds).forEach((membershipId) => {
    if (candidateByMembership.has(membershipId)) mentionMembershipIds.add(membershipId);
  });
  extractHandles(rawBody).forEach((handle) => {
    const membershipId = membershipByHandle.get(handle);
    if (typeof membershipId === 'number') mentionMembershipIds.add(membershipId);
  });

  const sortedMembershipIds = Array.from(mentionMembershipIds).sort((a, b) => a - b);
  const mentionUserIds = sortedMembershipIds
    .map((membershipId) => candidateByMembership.get(membershipId)?.userId ?? null)
    .filter((userId): userId is number => userId != null);

  return {
    mentionMembershipIds: sortedMembershipIds,
    mentionUserIds: Array.from(new Set(mentionUserIds)),
    taskId: task.id,
    taskVersion: task.version,
    taskIsCrewOnly: task.isCrewOnly,
    taskTitle: task.title ?? null,
    flightPlanId: task.flightPlanId,
    planSlug: planSummary?.slug ?? null,
    planTitle: planSummary?.title ?? null,
  };
};
