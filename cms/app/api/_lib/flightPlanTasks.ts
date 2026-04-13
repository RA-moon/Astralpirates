import { randomUUID } from 'node:crypto';
import type { Payload } from 'payload';
import type { User } from '@/payload-types';

import {
  FLIGHT_PLAN_TASK_STATES,
  type FlightPlanTaskState,
} from '@astralpirates/shared/taskStates';
import {
  TASK_ATTACHMENT_MEDIA_PROXY_PATH,
  TASK_ATTACHMENT_MEDIA_SOURCE_PREFIXES,
  shouldTreatHostnameAsInternalMedia,
} from '@astralpirates/shared/mediaUrls';
import {
  loadMembershipsByIds,
  membershipIsAcceptedCrew,
  normaliseId,
  type AcceptedCrewMembership,
  type FlightPlanMembershipRecord,
  type IdLike,
} from './flightPlanMembers';
import { normalizeRichTextContent } from './content';
import { toCrewSummary, type CrewSummary } from './crew';

const TASK_STATE_SET = new Set<string>(FLIGHT_PLAN_TASK_STATES);
const TASK_COLLECTION = 'flight-plan-tasks';

export type FlightPlanTaskLink = {
  id: string;
  url: string;
  title: string | null;
  addedByMembershipId: number | null;
  addedAt: string;
};

export type FlightPlanTaskAttachment = {
  id: string;
  assetId: number;
  filename: string | null;
  url: string;
  mimeType: string | null;
  size: number | null;
  thumbnailUrl: string | null;
  addedByMembershipId: number | null;
  addedAt: string;
};

export type FlightPlanTaskRecord = {
  id: number;
  flightPlanId: number;
  ownerMembershipId: number;
  title: string;
  description: unknown;
  state: FlightPlanTaskState;
  listOrder: number;
  assigneeMembershipIds: number[];
  attachments: FlightPlanTaskAttachment[];
  links: FlightPlanTaskLink[];
  isCrewOnly: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const parseAssigneeIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const entry of value) {
    const id = normaliseId(entry);
    if (id != null && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
};

const sanitizeTaskState = (value: unknown): FlightPlanTaskState => {
  if (typeof value === 'string' && TASK_STATE_SET.has(value)) {
    return value as FlightPlanTaskState;
  }
  return 'ideation';
};

const sanitizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const sanitizeUrl = (value: unknown): string | null => {
  const url = sanitizeString(value);
  if (!url) return null;
  if (!URL.canParse(url)) {
    return null;
  }
  return url;
};

const encodePathSegments = (value: string): string =>
  value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const decodePath = (value: string): string => {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeRelativeAttachmentPath = (value: string | null | undefined): string | null => {
  const trimmed = sanitizeString(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  return normalized;
};

const extractRelativePathFromPrefixes = (value: string): string | null => {
  for (const prefix of TASK_ATTACHMENT_MEDIA_SOURCE_PREFIXES) {
    const prefixIndex = value.indexOf(prefix);
    if (prefixIndex === -1) continue;
    const relative = value.slice(prefixIndex + prefix.length).replace(/^\/+/, '');
    if (!relative) continue;
    return decodePath(relative);
  }
  return null;
};

const toPathname = (value: string): string | null => {
  if (!value) return null;
  try {
    return new URL(value).pathname;
  } catch {
    const [pathname] = value.split(/[?#]/, 1);
    return pathname || null;
  }
};

export const buildTaskAttachmentProxyUrl = (value: string | null | undefined): string | null => {
  const normalized = normalizeRelativeAttachmentPath(value);
  if (!normalized) return null;
  return `${TASK_ATTACHMENT_MEDIA_PROXY_PATH}${encodePathSegments(normalized)}`;
};

export const normalizeTaskAttachmentUrl = (
  value: string | null | undefined,
): string | null => {
  const trimmed = sanitizeString(value);
  if (!trimmed) return null;

  const pathname = toPathname(trimmed);
  if (!pathname) return null;
  const prefixedPath = extractRelativePathFromPrefixes(pathname);
  if (prefixedPath) {
    return buildTaskAttachmentProxyUrl(prefixedPath);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const host = new URL(trimmed).hostname.toLowerCase();
      if (shouldTreatHostnameAsInternalMedia(host)) {
        return trimmed;
      }
    } catch {
      return null;
    }
    return trimmed;
  }

  return buildTaskAttachmentProxyUrl(pathname);
};

export const resolveTaskAttachmentDeliveryUrl = ({
  filename,
  url,
}: {
  filename: string | null | undefined;
  url: string | null | undefined;
}): string | null => {
  const fromFilename = buildTaskAttachmentProxyUrl(filename);
  if (fromFilename) return fromFilename;
  return normalizeTaskAttachmentUrl(url);
};

const parseLinks = (value: unknown): FlightPlanTaskLink[] => {
  if (!Array.isArray(value)) return [];
  const results: FlightPlanTaskLink[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as {
      id?: unknown;
      url?: unknown;
      title?: unknown;
      addedByMembershipId?: unknown;
      addedAt?: unknown;
    };
    const id = sanitizeString(record.id) ?? randomUUID();
    const url = sanitizeUrl(record.url);
    if (!id || !url) return;
    const addedAt =
      typeof record.addedAt === 'string' && record.addedAt.trim().length
        ? record.addedAt
        : new Date().toISOString();
    results.push({
      id,
      url,
      title: sanitizeString(record.title),
      addedByMembershipId: normaliseId(record.addedByMembershipId),
      addedAt,
    });
  });
  return results;
};

const parseAttachments = (value: unknown): FlightPlanTaskAttachment[] => {
  if (!Array.isArray(value)) return [];
  const results: FlightPlanTaskAttachment[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as {
      id?: unknown;
      assetId?: unknown;
      url?: unknown;
      filename?: unknown;
      mimeType?: unknown;
      size?: unknown;
      thumbnailUrl?: unknown;
      addedByMembershipId?: unknown;
      addedAt?: unknown;
    };
    const assetId = normaliseId(record.assetId);
    const filename = sanitizeString(record.filename);
    const url = resolveTaskAttachmentDeliveryUrl({
      filename,
      url: sanitizeString(record.url),
    });
    if (assetId == null || !url) return;
    const id = sanitizeString(record.id) ?? `asset-${assetId}-${randomUUID()}`;
    const addedAt =
      typeof record.addedAt === 'string' && record.addedAt.trim().length
        ? record.addedAt
        : new Date().toISOString();
    results.push({
      id,
      assetId,
      url,
      filename,
      mimeType: sanitizeString(record.mimeType),
      size:
        typeof record.size === 'number' && Number.isFinite(record.size)
          ? record.size
          : null,
      thumbnailUrl: resolveTaskAttachmentDeliveryUrl({
        filename,
        url: sanitizeString(record.thumbnailUrl),
      }),
      addedByMembershipId: normaliseId(record.addedByMembershipId),
      addedAt,
    });
  });
  return results;
};

const toTaskRecord = (doc: unknown): FlightPlanTaskRecord | null => {
  if (!doc || typeof doc !== 'object') return null;
  const record = doc as {
    id?: IdLike;
    flightPlan?: IdLike;
    ownerMembership?: IdLike;
    title?: unknown;
    listOrder?: unknown;
    description?: unknown;
    assigneeMembershipIds?: unknown;
    state?: unknown;
    attachments?: unknown;
    links?: unknown;
    isCrewOnly?: unknown;
    version?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  const id = normaliseId(record.id);
  const flightPlanId = normaliseId(record.flightPlan);
  const ownerMembershipId = normaliseId(record.ownerMembership);
  if (id == null || flightPlanId == null || ownerMembershipId == null) return null;

  const title = typeof record.title === 'string' ? record.title : '';
  if (!title.trim()) return null;

  const listOrder =
    typeof record.listOrder === 'number' && Number.isFinite(record.listOrder) ? record.listOrder : Date.now();

  const description = record.description ?? [];
  const assigneeMembershipIds = parseAssigneeIds(record.assigneeMembershipIds);

  const state = sanitizeTaskState(record.state);
  const attachments = parseAttachments(record.attachments);
  const links = parseLinks(record.links);
  const isCrewOnly = Boolean(record.isCrewOnly);
  const version =
    typeof record.version === 'number' && Number.isFinite(record.version)
      ? record.version
      : 1;

  return {
    id,
    flightPlanId,
    ownerMembershipId,
    title,
    description,
    state,
    listOrder,
    assigneeMembershipIds,
    attachments,
    links,
    isCrewOnly,
    version,
    createdAt:
      typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
};

export const loadTaskById = async (
  payload: Payload,
  taskId: number,
): Promise<FlightPlanTaskRecord | null> => {
  try {
    const doc = await payload.findByID({
      collection: TASK_COLLECTION,
      id: taskId,
      depth: 0,
      overrideAccess: true,
    });
    return toTaskRecord(doc);
  } catch (error) {
    payload.logger?.warn?.({ err: error, taskId }, '[flight-plan-task] failed to load task by id');
    return null;
  }
};

export const listTasksForFlightPlan = async (
  payload: Payload,
  flightPlanId: number,
): Promise<FlightPlanTaskRecord[]> => {
  const result = await payload.find({
    collection: TASK_COLLECTION,
    where: {
      flightPlan: {
        equals: flightPlanId,
      },
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  const records: FlightPlanTaskRecord[] = [];
  for (const doc of result.docs) {
    const record = toTaskRecord(doc);
    if (record) records.push(record);
  }
  return records.sort((a, b) => {
    if (a.state === b.state) {
      return a.listOrder - b.listOrder;
    }
    return FLIGHT_PLAN_TASK_STATES.indexOf(a.state) - FLIGHT_PLAN_TASK_STATES.indexOf(b.state);
  });
};

type MembershipSummaryMaps = {
  membershipMap: Map<number, FlightPlanMembershipRecord>;
  summaryByMembership: Map<number, CrewSummary>;
};

export const buildMembershipSummaryMap = async (
  payload: Payload,
  membershipIds: number[],
): Promise<MembershipSummaryMaps> => {
  const membershipMap = await loadMembershipsByIds(payload, membershipIds);
  if (!membershipMap.size) {
    return {
      membershipMap,
      summaryByMembership: new Map(),
    };
  }

  const userIds = new Set<number>();
  membershipMap.forEach((membership) => {
    if (membership.userId != null) userIds.add(membership.userId);
  });

  const usersResult =
    userIds.size > 0
      ? await payload.find({
          collection: 'users',
          where: {
            id: {
              in: Array.from(userIds),
            },
          },
          limit: userIds.size,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] };

  const summaryByMembership = new Map<number, CrewSummary>();
  const summaryByUser = new Map<number, CrewSummary>();

  usersResult.docs.forEach((doc) => {
    const summary = toCrewSummary(doc as User);
    if (summary) {
      summaryByUser.set(summary.id, summary);
    }
  });

  membershipMap.forEach((membership, id) => {
    const summary = membership.userId != null ? summaryByUser.get(membership.userId) ?? null : null;
    if (summary) summaryByMembership.set(id, summary);
  });

  return {
    membershipMap,
    summaryByMembership,
  };
};

export const serializeTask = (
  task: FlightPlanTaskRecord,
  summaries: MembershipSummaryMaps,
  options: { maskContent?: boolean } = {},
) => ({
  id: task.id,
  flightPlanId: task.flightPlanId,
  title: options.maskContent ? 'Crew-only task' : task.title,
  description: options.maskContent ? [] : normalizeRichTextContent(task.description),
  state: task.state,
  listOrder: task.listOrder,
  ownerMembershipId: task.ownerMembershipId,
  owner: options.maskContent ? null : summaries.summaryByMembership.get(task.ownerMembershipId) ?? null,
  assigneeMembershipIds: task.assigneeMembershipIds,
  assignees: options.maskContent
    ? []
    : task.assigneeMembershipIds
        .map((membershipId) => summaries.summaryByMembership.get(membershipId))
        .filter((member): member is CrewSummary => Boolean(member)),
  attachments: options.maskContent ? [] : task.attachments,
  links: options.maskContent ? [] : task.links,
  isCrewOnly: task.isCrewOnly,
  version: task.version,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

export const filterCrewAssignableMemberships = (
  membershipMap: Map<number, FlightPlanMembershipRecord>,
  ids: number[],
): number[] =>
  ids.filter((id) => {
    const membership = membershipMap.get(id);
    return membershipIsAcceptedCrew(membership);
  });

export const membershipMatchesFlightPlan = (
  membership: FlightPlanMembershipRecord | null | undefined,
  flightPlanId: number,
): boolean => {
  if (!membership) return false;
  return membership.flightPlanId === flightPlanId;
};

export const ensureCrewMembershipForPlan = (
  membership: FlightPlanMembershipRecord | null | undefined,
  flightPlanId: number,
): membership is AcceptedCrewMembership =>
  membershipMatchesFlightPlan(membership, flightPlanId) && membershipIsAcceptedCrew(membership);
