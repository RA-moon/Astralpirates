import type { Payload, PayloadRequest } from 'payload';
import type { User } from '@/payload-types';

import { can } from '@astralpirates/shared/authorization';
import type { EffectiveAdminMode } from '@astralpirates/shared/adminMode';
import { isFlightPlanLifecycleTerminalStatus } from '@astralpirates/shared/flightPlanLifecycle';
import { canUserReadFlightPlan } from './accessPolicy';
import { enqueueFlightPlanMembershipEvent } from '@/src/utils/flightPlanMembershipEvents';
import type {
  FlightPlanInvitationStatus,
  FlightPlanRole,
} from '@/src/collections/FlightPlanMemberships';
import type { AccessPolicyInput } from '@astralpirates/shared/accessPolicy';

export type IdLike = unknown;

export const normaliseId = (value: IdLike): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normaliseId((value as { id?: IdLike }).id);
  }
  return null;
};

const MEMBERSHIP_COLLECTION = 'flight-plan-memberships' as const;

type CachedFlightPlan = {
  doc: Record<string, unknown>;
  expiresAt: number;
};

const flightPlanSlugCache = new Map<string, CachedFlightPlan>();
const SLUG_CACHE_TTL_MS = 30_000;

export const sanitizeFlightPlanSlug = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const resolveFlightPlanBySlug = async (
  payload: Payload,
  slug: string,
): Promise<Record<string, unknown> | null> => {
  const cached = flightPlanSlugCache.get(slug);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { ...cached.doc };
  }

  const result = await payload.find({
    collection: 'flight-plans',
    where: {
      slug: {
        equals: slug,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = (result.docs[0] as unknown as Record<string, unknown> | undefined) ?? null;

  if (doc) {
    flightPlanSlugCache.set(slug, {
      doc,
      expiresAt: now + SLUG_CACHE_TTL_MS,
    });
  }

  return doc;
};

export type FlightPlanSummary = {
  id: number;
  slug: string | null;
  title: string | null;
  path: string | null;
};

const toFlightPlanSummary = (doc: unknown): FlightPlanSummary | null => {
  if (!doc || typeof doc !== 'object') return null;
  const record = doc as { id?: IdLike; slug?: unknown; title?: unknown; path?: unknown };
  const id = normaliseId(record.id);
  if (id == null) return null;
  const slug = typeof record.slug === 'string' && record.slug.length ? record.slug : null;
  const title = typeof record.title === 'string' && record.title.length ? record.title : null;
  const path =
    typeof record.path === 'string' && record.path.length ? record.path : slug ? `/flight-plans/${slug}` : null;
  return {
    id,
    slug,
    title,
    path,
  };
};

export const loadFlightPlanSummary = async (
  payload: Payload,
  flightPlanId: IdLike,
): Promise<FlightPlanSummary | null> => {
  const id = normaliseId(flightPlanId);
  if (id == null) return null;

  try {
    const doc = (await payload.findByID({
      collection: 'flight-plans',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>;
    return toFlightPlanSummary(doc);
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, flightPlanId: id },
      '[flight-plan] failed to load plan summary by id',
    );
    return null;
  }
};

const sanitizeStatus = (value: unknown): FlightPlanInvitationStatus => {
  if (value === 'accepted' || value === 'declined' || value === 'revoked' || value === 'pending') {
    return value;
  }
  return 'pending';
};

const sanitizeRole = (value: unknown): FlightPlanRole => {
  if (value === 'owner' || value === 'crew' || value === 'guest') {
    return value;
  }
  if (value === 'participant') {
    return 'crew';
  }
  return 'guest';
};

export type FlightPlanMembershipRecord = {
  id: number;
  flightPlanId: number;
  userId: number;
  role: FlightPlanRole;
  status: FlightPlanInvitationStatus;
  invitedById: number | null;
  invitedAt: string | null;
  respondedAt: string | null;
};

export type AcceptedCrewMembership = FlightPlanMembershipRecord & {
  status: 'accepted';
  role: 'owner' | 'crew';
};

export type AcceptedPassengerMembership = FlightPlanMembershipRecord & {
  status: 'accepted';
  role: 'guest';
};

export const membershipMatchesFlightPlan = (
  membership: FlightPlanMembershipRecord | null | undefined,
  flightPlanId: number,
): boolean => {
  if (!membership) return false;
  return membership.flightPlanId === flightPlanId;
};

const toMembershipRecord = (doc: unknown): FlightPlanMembershipRecord | null => {
  if (!doc || typeof doc !== 'object') return null;
  const record = doc as {
    id?: IdLike;
    flightPlan?: IdLike;
    user?: IdLike;
    invitedBy?: IdLike;
    invitedAt?: unknown;
    respondedAt?: unknown;
    role?: unknown;
    invitationStatus?: unknown;
  };
  const id = normaliseId(record.id);
  const flightPlanId = normaliseId(record.flightPlan);
  const userId = normaliseId(record.user);
  if (id == null || flightPlanId == null || userId == null) return null;

  const invitedById = normaliseId(record.invitedBy);
  const invitedAt =
    typeof record.invitedAt === 'string' && record.invitedAt.length > 0 ? record.invitedAt : null;
  const respondedAt =
    typeof record.respondedAt === 'string' && record.respondedAt.length > 0
      ? record.respondedAt
      : null;
  const role = sanitizeRole(record.role);
  const status = sanitizeStatus(record.invitationStatus);

  return {
    id,
    flightPlanId,
    userId,
    role,
    status,
    invitedById,
    invitedAt,
    respondedAt,
  };
};

export const loadMembership = async (
  payload: Payload,
  flightPlanId: IdLike,
  userId: IdLike,
): Promise<FlightPlanMembershipRecord | null> => {
  const flightPlan = normaliseId(flightPlanId);
  const user = normaliseId(userId);
  if (flightPlan == null || user == null) return null;

  const result = await payload.find({
    collection: MEMBERSHIP_COLLECTION,
    where: {
      and: [
        { flightPlan: { equals: flightPlan } },
        { user: { equals: user } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  return toMembershipRecord(doc);
};

export const loadMembershipById = async (
  payload: Payload,
  membershipId: IdLike,
): Promise<FlightPlanMembershipRecord | null> => {
  const id = normaliseId(membershipId);
  if (id == null) return null;

  try {
    const doc = await payload.findByID({
      collection: MEMBERSHIP_COLLECTION,
      id,
      depth: 0,
      overrideAccess: true,
    });
    return toMembershipRecord(doc);
  } catch (error) {
    payload.logger?.warn?.({ err: error, membershipId: id }, '[flight-plan] failed to load membership by id');
    return null;
  }
};

export const loadMembershipsByIds = async (
  payload: Payload,
  membershipIds: number[],
): Promise<Map<number, FlightPlanMembershipRecord>> => {
  if (!membershipIds.length) return new Map();
  const uniqueIds = Array.from(new Set(membershipIds.map((value) => normaliseId(value)).filter((value): value is number => value != null)));
  if (!uniqueIds.length) return new Map();

  const result = await payload.find({
    collection: MEMBERSHIP_COLLECTION,
    where: {
      id: {
        in: uniqueIds,
      },
    },
    limit: uniqueIds.length,
    depth: 0,
    overrideAccess: true,
  });

  const map = new Map<number, FlightPlanMembershipRecord>();
  result.docs.forEach((doc) => {
    const record = toMembershipRecord(doc);
    if (record) {
      map.set(record.id, record);
    }
  });
  return map;
};

export const membershipIsAcceptedCrew = (
  membership: FlightPlanMembershipRecord | null | undefined,
): membership is AcceptedCrewMembership =>
  Boolean(
    membership &&
      membership.status === 'accepted' &&
      (membership.role === 'owner' || membership.role === 'crew'),
  );

export const membershipIsAcceptedPassenger = (
  membership: FlightPlanMembershipRecord | null | undefined,
): membership is AcceptedPassengerMembership =>
  Boolean(membership && membership.status === 'accepted' && membership.role === 'guest');

export const ensureOwnerMembership = async ({
  payload,
  flightPlanId,
  ownerId,
  req,
}: {
  payload: Payload;
  flightPlanId: IdLike;
  ownerId: IdLike;
  req?: PayloadRequest;
}) => {
  const flightPlan = normaliseId(flightPlanId);
  const owner = normaliseId(ownerId);
  if (flightPlan == null || owner == null) return null;

  const reqContext = req ? { req } : {};
  const existing = await payload.find({
    collection: MEMBERSHIP_COLLECTION,
    where: {
      and: [
        { flightPlan: { equals: flightPlan } },
        { role: { equals: 'owner' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...reqContext,
  });

  const nowIso = new Date().toISOString();
  const current = existing.docs[0];
  const asRecord = current ? toMembershipRecord(current) : null;

  if (asRecord && asRecord.userId === owner && asRecord.status === 'accepted') {
    if (current?.respondedAt === null || typeof current?.respondedAt !== 'string') {
      try {
        let invitedAt = nowIso;
        if (current && typeof (current as { invitedAt?: unknown }).invitedAt === 'string') {
          invitedAt = (current as { invitedAt?: unknown }).invitedAt as string;
        }
        const updated = await payload.update({
          collection: MEMBERSHIP_COLLECTION,
          id: asRecord.id,
          data: {
            respondedAt: nowIso,
            invitationStatus: 'accepted',
          },
          overrideAccess: true,
          ...reqContext,
        });
        await enqueueFlightPlanMembershipEvent(payload, {
          membershipId: asRecord.id,
          flightPlanId: flightPlan,
          userId: owner,
          role: 'owner',
          status: 'accepted',
          invitedById: owner,
          invitedAt,
          respondedAt: nowIso,
        });
        return toMembershipRecord(updated);
      } catch (error) {
        payload.logger?.warn?.(
          { err: error, flightPlanId: flightPlan, ownerId: owner },
          '[flight-plan-membership] failed to refresh owner membership timestamp',
        );
        return asRecord;
      }
    }
    return asRecord;
  }

  if (asRecord) {
    try {
      const updated = await payload.update({
        collection: MEMBERSHIP_COLLECTION,
        id: asRecord.id,
        data: {
          user: owner,
          invitationStatus: 'accepted',
          invitedBy: owner,
          invitedAt: nowIso,
          respondedAt: nowIso,
        },
        overrideAccess: true,
        ...reqContext,
      });
      const next = toMembershipRecord(updated);
      if (next) {
        await enqueueFlightPlanMembershipEvent(payload, {
          membershipId: next.id,
          flightPlanId: next.flightPlanId,
          userId: next.userId,
          role: next.role,
          status: next.status,
          invitedById: next.invitedById,
          invitedAt: next.invitedAt,
          respondedAt: next.respondedAt,
        });
      }
      return next;
    } catch (error) {
      payload.logger?.error?.(
        { err: error, flightPlanId: flightPlan, ownerId: owner },
        '[flight-plan-membership] failed to update owner membership',
      );
      return asRecord;
    }
  }

  try {
    const created = await payload.create({
      collection: MEMBERSHIP_COLLECTION,
      data: {
        flightPlan,
        user: owner,
        role: 'owner',
        invitationStatus: 'accepted',
        invitedBy: owner,
        invitedAt: nowIso,
        respondedAt: nowIso,
      },
      draft: false,
      overrideAccess: true,
      ...reqContext,
    });
    const next = toMembershipRecord(created);
    if (next) {
      await enqueueFlightPlanMembershipEvent(payload, {
        membershipId: next.id,
        flightPlanId: next.flightPlanId,
        userId: next.userId,
        role: next.role,
        status: next.status,
        invitedById: next.invitedById,
        invitedAt: next.invitedAt,
        respondedAt: next.respondedAt,
      });
    }
    return next;
  } catch (error) {
    payload.logger?.error?.(
      { err: error, flightPlanId: flightPlan, ownerId: owner },
      '[flight-plan-membership] failed to create owner membership',
    );
    return null;
  }
};

export const ensureCrewMembership = async ({
  payload,
  flightPlanId,
  userId,
  inviterId,
}: {
  payload: Payload;
  flightPlanId: IdLike;
  userId: IdLike;
  inviterId?: IdLike;
}): Promise<FlightPlanMembershipRecord | null> => {
  const flightPlan = normaliseId(flightPlanId);
  const user = normaliseId(userId);
  const inviter = normaliseId(inviterId ?? userId);
  if (flightPlan == null || user == null || inviter == null) return null;

  const nowIso = new Date().toISOString();
  const existing = await loadMembership(payload, flightPlan, user);
  if (existing) {
    if (existing.status === 'accepted' && (existing.role === 'owner' || existing.role === 'crew')) {
      return existing;
    }
    try {
      const updated = await payload.update({
        collection: MEMBERSHIP_COLLECTION,
        id: existing.id,
        data: {
          role: 'crew',
          invitationStatus: 'accepted',
          invitedBy: inviter,
          invitedAt: existing.invitedAt ?? nowIso,
          respondedAt: nowIso,
        },
        overrideAccess: true,
      });
      const record = toMembershipRecord(updated);
      if (record) {
        await enqueueFlightPlanMembershipEvent(payload, {
          membershipId: record.id,
          flightPlanId: record.flightPlanId,
          userId: record.userId,
          role: record.role,
          status: record.status,
          invitedById: record.invitedById,
          invitedAt: record.invitedAt,
          respondedAt: record.respondedAt,
        });
      }
      return record;
    } catch (error) {
      payload.logger?.warn?.(
        { err: error, flightPlanId: flightPlan, userId: user },
        '[flight-plan-membership] failed to upgrade crew membership',
      );
      return existing;
    }
  }

  try {
    const created = await payload.create({
      collection: MEMBERSHIP_COLLECTION,
      data: {
        flightPlan,
        user,
        role: 'crew',
        invitationStatus: 'accepted',
        invitedBy: inviter,
        invitedAt: nowIso,
        respondedAt: nowIso,
      },
      draft: false,
      overrideAccess: true,
    });
    const record = toMembershipRecord(created);
    if (record) {
      await enqueueFlightPlanMembershipEvent(payload, {
        membershipId: record.id,
        flightPlanId: record.flightPlanId,
        userId: record.userId,
        role: record.role,
        status: record.status,
        invitedById: record.invitedById,
        invitedAt: record.invitedAt,
        respondedAt: record.respondedAt,
      });
    }
    return record;
  } catch (error) {
    payload.logger?.error?.(
      { err: error, flightPlanId: flightPlan, userId: user },
      '[flight-plan-membership] failed to create crew membership',
    );
    return null;
  }
};

type OwnerFallbackArgs = {
  payload: Payload;
  flightPlanId: IdLike;
  userId: IdLike;
  ownerIdHint?: IdLike;
};

export const loadMembershipWithOwnerFallback = async ({
  payload,
  flightPlanId,
  userId,
  ownerIdHint,
}: OwnerFallbackArgs): Promise<FlightPlanMembershipRecord | null> => {
  const membership = await loadMembership(payload, flightPlanId, userId);
  if (membership) return membership;

  const ownerId = normaliseId(ownerIdHint);
  const targetId = normaliseId(userId);
  if (ownerId != null && targetId != null && ownerId === targetId) {
    return ensureOwnerMembership({ payload, flightPlanId, ownerId });
  }
  return null;
};

type FlightPlanViewerUser = {
  id?: unknown;
  role?: unknown;
} | null | undefined;

const normalizeWebsiteRole = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const resolveCapabilityMembershipRole = (
  membership: FlightPlanMembershipRecord | null | undefined,
): 'owner' | 'crew' | 'passenger' | null => {
  if (!membership) return null;
  if (membership.role === 'owner') return 'owner';
  if (membership.role === 'crew') return 'crew';
  if (membership.role === 'guest') return 'passenger';
  return null;
};

const resolveCapabilityMembershipStatus = (
  membership: FlightPlanMembershipRecord | null | undefined,
): 'accepted' | 'pending' | 'declined' | 'revoked' | null => {
  if (!membership) return null;
  if (membership.status === 'accepted') return 'accepted';
  if (membership.status === 'pending') return 'pending';
  if (membership.status === 'declined') return 'declined';
  if (membership.status === 'revoked') return 'revoked';
  return null;
};

export const isContributorMembership = ({
  membership,
  userId,
  ownerId,
  publicContributions,
}: {
  membership: FlightPlanMembershipRecord | null | undefined;
  userId: IdLike;
  ownerId?: IdLike;
  publicContributions: boolean;
}): boolean => {
  if (!publicContributions || !membership) return false;
  if (membership.status !== 'accepted' || membership.role !== 'crew') return false;
  const actorId = normaliseId(userId);
  if (actorId == null) return false;
  const normalizedOwnerId = normaliseId(ownerId);
  if (normalizedOwnerId != null && actorId === normalizedOwnerId) return false;
  return membership.invitedById != null && membership.invitedById === actorId;
};

export const buildFlightPlanAuthorizationContext = ({
  user,
  ownerId,
  membership,
  adminMode,
  attributes,
}: {
  user: FlightPlanViewerUser;
  ownerId?: IdLike;
  membership?: FlightPlanMembershipRecord | null;
  adminMode?: EffectiveAdminMode | null;
  attributes?: Record<string, boolean>;
}) => {
  const actorId = normaliseId(user?.id);
  const normalizedOwnerId = normaliseId(ownerId);
  const membershipRole = resolveCapabilityMembershipRole(membership);
  const membershipStatus = resolveCapabilityMembershipStatus(membership);

  return {
    actor: {
      userId: actorId,
      isAuthenticated: actorId != null,
      websiteRole: normalizeWebsiteRole(user?.role),
    },
    owner: {
      userId: normalizedOwnerId,
    },
    membership:
      membershipRole != null || membershipStatus != null
        ? {
            role: membershipRole,
            status: membershipStatus,
          }
        : undefined,
    toggles: {
      adminViewEnabled: adminMode?.adminViewEnabled ?? false,
      adminEditEnabled: adminMode?.adminEditEnabled ?? false,
    },
    attributes: attributes ?? undefined,
  } as const;
};

export const hasAdminEditOverrideForUser = ({
  userId,
  websiteRole,
  adminMode,
}: {
  userId: IdLike;
  websiteRole?: unknown;
  adminMode?: EffectiveAdminMode | null;
}): boolean => {
  const actorId = normaliseId(userId);
  if (actorId == null) return false;
  return can('adminEditAllContent', {
    actor: {
      userId: actorId,
      isAuthenticated: true,
      websiteRole: normalizeWebsiteRole(websiteRole),
    },
    toggles: {
      adminViewEnabled: adminMode?.adminViewEnabled ?? false,
      adminEditEnabled: adminMode?.adminEditEnabled ?? false,
    },
  });
};

export const evaluateFlightPlanReadAccessDecision = ({
  user,
  ownerId,
  membership,
  policy,
  visibility,
  isPublic,
  publicContributions,
  adminMode,
}: {
  user: FlightPlanViewerUser;
  ownerId?: IdLike;
  membership?: FlightPlanMembershipRecord | null;
  policy?: AccessPolicyInput;
  visibility?: unknown;
  isPublic?: unknown;
  publicContributions?: unknown;
  adminMode?: EffectiveAdminMode | null;
}): {
  allowed: boolean;
  baselineRead: boolean;
  adminOverrideApplied: boolean;
} => {
  const membershipRole =
    membership?.status === 'accepted' ? membership.role : null;
  const baselineRead = canUserReadFlightPlan({
    user,
    ownerId,
    membershipRole,
    policy,
    visibility,
    isPublic,
    publicContributions,
  });

  const allowed = can(
    'readFlightPlan',
    buildFlightPlanAuthorizationContext({
      user,
      ownerId,
      membership,
      adminMode,
      attributes: {
        readFlightPlan: baselineRead,
      },
    }),
  );

  return {
    allowed,
    baselineRead,
    adminOverrideApplied: allowed && !baselineRead,
  };
};

export const evaluateFlightPlanReadAccess = (input: Parameters<
  typeof evaluateFlightPlanReadAccessDecision
>[0]): boolean => {
  return evaluateFlightPlanReadAccessDecision(input).allowed;
};

export const evaluateFlightPlanEditAccessDecision = ({
  user,
  ownerId,
  membership,
  adminMode,
  status,
  viewerIsContributor = false,
}: {
  user: FlightPlanViewerUser;
  ownerId?: IdLike;
  membership?: FlightPlanMembershipRecord | null;
  adminMode?: EffectiveAdminMode | null;
  status?: unknown;
  viewerIsContributor?: boolean;
}): {
  allowed: boolean;
  baselineEdit: boolean;
  adminOverrideApplied: boolean;
  blockedByTerminal: boolean;
  blockedByContributor: boolean;
} => {
  const actorId = normaliseId(user?.id);
  const normalizedOwnerId = normaliseId(ownerId);
  const isOwner =
    actorId != null &&
    normalizedOwnerId != null &&
    actorId === normalizedOwnerId;
  const membershipAllowsEdit = Boolean(
    membership?.status === 'accepted' &&
      (membership.role === 'owner' || membership.role === 'crew'),
  );
  const baselineEdit = isOwner || membershipAllowsEdit;

  const capabilityAllowed = can(
    'editFlightPlan',
    buildFlightPlanAuthorizationContext({
      user,
      ownerId,
      membership,
      adminMode,
      attributes: {
        editFlightPlan: baselineEdit,
      },
    }),
  );

  const adminOverrideApplied = capabilityAllowed && !baselineEdit;
  const blockedByContributor = !adminOverrideApplied && viewerIsContributor && !isOwner;
  const blockedByTerminal =
    !adminOverrideApplied && isFlightPlanLifecycleTerminalStatus(status) && !isOwner;
  const allowed =
    capabilityAllowed &&
    !blockedByContributor &&
    !blockedByTerminal;

  return {
    allowed,
    baselineEdit,
    adminOverrideApplied,
    blockedByTerminal,
    blockedByContributor,
  };
};

export const evaluateFlightPlanEditAccess = (input: Parameters<
  typeof evaluateFlightPlanEditAccessDecision
>[0]): boolean => {
  return evaluateFlightPlanEditAccessDecision(input).allowed;
};

export const listAcceptedMemberIds = async (
  payload: Payload,
  flightPlanId: IdLike,
): Promise<number[]> => {
  const flightPlan = normaliseId(flightPlanId);
  if (flightPlan == null) return [];

  const result = await payload.find({
    collection: MEMBERSHIP_COLLECTION,
    where: {
      and: [
        { flightPlan: { equals: flightPlan } },
        {
          invitationStatus: {
            in: ['accepted'],
          },
        },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  const memberIds: number[] = [];
  for (const doc of result.docs) {
    const record = toMembershipRecord(doc);
    if (record && record.status === 'accepted' && (record.role === 'owner' || record.role === 'crew')) {
      memberIds.push(record.userId);
    }
  }
  return memberIds;
};

const resolveUserHasProfile = (user: User | null | undefined): boolean =>
  Boolean(user?.profileSlug && typeof user.profileSlug === 'string' && user.profileSlug.length > 0);

const ensurePendingInviteState = async (
  payload: Payload,
  record: FlightPlanMembershipRecord | null,
): Promise<FlightPlanMembershipRecord | null> => {
  if (!record) return null;
  if (record.status === 'pending' && record.respondedAt == null) {
    return record;
  }

  payload.logger?.warn?.(
    {
      membershipId: record.id,
      status: record.status,
      respondedAt: record.respondedAt,
    },
    '[flight-plan-membership] invite unexpectedly resolved during creation',
  );

  try {
    const corrected = await payload.update({
      collection: MEMBERSHIP_COLLECTION,
      id: record.id,
      data: {
        invitationStatus: 'pending',
        respondedAt: null,
      },
      overrideAccess: true,
    });
    return toMembershipRecord(corrected);
  } catch (error) {
    payload.logger?.error?.(
      { err: error, membershipId: record.id },
      '[flight-plan-membership] failed to enforce pending invite state',
    );
    return record;
  }
};

export const inviteMember = async ({
  payload,
  flightPlanId,
  inviterId,
  targetUser,
}: {
  payload: Payload;
  flightPlanId: IdLike;
  inviterId: IdLike;
  targetUser: User;
}) => {
  const flightPlan = normaliseId(flightPlanId);
  const inviter = normaliseId(inviterId);
  const invitee = normaliseId(targetUser?.id);
  if (flightPlan == null || inviter == null || invitee == null) {
    throw new Error('Invalid identifiers for membership invite.');
  }

  if (!resolveUserHasProfile(targetUser)) {
    throw new Error('User must maintain a profile before they can be invited.');
  }

  const existing = await loadMembership(payload, flightPlan, invitee);
  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Crew member already participates in this flight plan.');
    }
    if (existing.status === 'pending') {
      throw new Error('Crew member already has a pending invite.');
    }
    if (existing.status === 'declined' || existing.status === 'revoked') {
      // allow re-invite by updating the same membership
      const nowIso = new Date().toISOString();
      const updated = await payload.update({
        collection: MEMBERSHIP_COLLECTION,
        id: existing.id,
        data: {
          invitationStatus: 'pending',
          invitedBy: inviter,
          invitedAt: nowIso,
          role: 'guest',
          respondedAt: null,
        },
        overrideAccess: true,
      });
      let record = toMembershipRecord(updated);
      record = await ensurePendingInviteState(payload, record);
      if (record) {
        await enqueueFlightPlanMembershipEvent(payload, {
          membershipId: record.id,
          flightPlanId: record.flightPlanId,
          userId: record.userId,
          role: record.role,
          status: record.status,
          invitedById: record.invitedById,
          invitedAt: record.invitedAt,
          respondedAt: record.respondedAt,
        });
      }
      return record;
    }
  }

  const nowIso = new Date().toISOString();
  const created = await payload.create({
    collection: MEMBERSHIP_COLLECTION,
    data: {
      flightPlan,
      user: invitee,
      role: 'guest',
      invitationStatus: 'pending',
      invitedBy: inviter,
      invitedAt: nowIso,
      respondedAt: null,
    },
    draft: false,
    overrideAccess: true,
  });

  let record = toMembershipRecord(created);
  record = await ensurePendingInviteState(payload, record);
  if (record) {
    await enqueueFlightPlanMembershipEvent(payload, {
      membershipId: record.id,
      flightPlanId: record.flightPlanId,
      userId: record.userId,
      role: record.role,
      status: record.status,
      invitedById: record.invitedById,
      invitedAt: record.invitedAt,
      respondedAt: record.respondedAt,
    });
  }
  return record;
};

export const respondToInvite = async ({
  payload,
  membership,
  accept,
  actorId,
}: {
  payload: Payload;
  membership: FlightPlanMembershipRecord;
  accept: boolean;
  actorId: IdLike;
}) => {
  const actor = normaliseId(actorId);
  if (actor == null || actor !== membership.userId) {
    throw new Error('Only the invited crew member can respond.');
  }

  const nextStatus: FlightPlanInvitationStatus = accept ? 'accepted' : 'declined';
  const nowIso = new Date().toISOString();

  const updated = await payload.update({
    collection: MEMBERSHIP_COLLECTION,
    id: membership.id,
    data: {
      invitationStatus: nextStatus,
      respondedAt: nowIso,
    },
    overrideAccess: true,
  });

  const record = toMembershipRecord(updated);
  if (record) {
    await enqueueFlightPlanMembershipEvent(payload, {
      membershipId: record.id,
      flightPlanId: record.flightPlanId,
      userId: record.userId,
      role: record.role,
      status: record.status,
      invitedById: record.invitedById,
      invitedAt: record.invitedAt,
      respondedAt: record.respondedAt,
    });
  }
  return record;
};

export const updateMembershipRole = async ({
  payload,
  membership,
  nextRole,
}: {
  payload: Payload;
  membership: FlightPlanMembershipRecord;
  nextRole: FlightPlanRole;
}): Promise<FlightPlanMembershipRecord> => {
  const updated = await payload.update({
    collection: MEMBERSHIP_COLLECTION,
    id: membership.id,
    data: {
      role: nextRole,
      updatedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });

  const record = toMembershipRecord(updated);
  if (record) {
    await enqueueFlightPlanMembershipEvent(payload, {
      membershipId: record.id,
      flightPlanId: record.flightPlanId,
      userId: record.userId,
      role: record.role,
      status: record.status,
      invitedById: record.invitedById,
      invitedAt: record.invitedAt,
      respondedAt: record.respondedAt,
      eventType: 'role-update',
    });
    return record;
  }

  throw new Error('Unable to update membership role.');
};

export const canEditFlightPlan = async ({
  payload,
  flightPlanId,
  userId,
  ownerIdHint,
  websiteRole,
  adminMode,
  status,
  publicContributions,
  enforceContributorPolicy = false,
}: {
  payload: Payload;
  flightPlanId: IdLike;
  userId: IdLike;
  ownerIdHint?: IdLike;
  websiteRole?: unknown;
  adminMode?: EffectiveAdminMode | null;
  status?: unknown;
  publicContributions?: boolean;
  enforceContributorPolicy?: boolean;
}): Promise<boolean> => {
  const ownerId = normaliseId(ownerIdHint);
  const actorId = normaliseId(userId);
  if (ownerId != null && actorId != null && ownerId === actorId) {
    return true;
  }
  const membership = ownerIdHint
    ? await loadMembershipWithOwnerFallback({ payload, flightPlanId, userId, ownerIdHint })
    : await loadMembership(payload, flightPlanId, userId);

  const viewerIsContributor = enforceContributorPolicy
    ? isContributorMembership({
        membership,
        userId: actorId,
        ownerId,
        publicContributions: Boolean(publicContributions),
      })
    : false;

  return evaluateFlightPlanEditAccess({
    user: {
      id: actorId,
      role: websiteRole,
    },
    ownerId,
    membership,
    adminMode,
    status,
    viewerIsContributor,
  });
};

export const ownerCanInvite = async ({
  payload,
  flightPlanId,
  userId,
  ownerIdHint,
  websiteRole,
  adminMode,
  allowCrewInvites = false,
}: {
  payload: Payload;
  flightPlanId: IdLike;
  userId: IdLike;
  ownerIdHint?: IdLike;
  websiteRole?: unknown;
  adminMode?: EffectiveAdminMode | null;
  allowCrewInvites?: boolean;
}): Promise<boolean> => {
  if (hasAdminEditOverrideForUser({ userId, websiteRole, adminMode })) {
    return true;
  }
  const membership = await loadMembershipWithOwnerFallback({
    payload,
    flightPlanId,
    userId,
    ownerIdHint,
  });
  if (!membership || membership.status !== 'accepted') return false;
  if (membership.role === 'owner') return true;
  if (allowCrewInvites && membership.role === 'crew') return true;
  return false;
};

export const listMembershipsForFlightPlan = async (
  payload: Payload,
  flightPlanId: IdLike,
): Promise<FlightPlanMembershipRecord[]> => {
  const flightPlan = normaliseId(flightPlanId);
  if (flightPlan == null) return [];

  const result = await payload.find({
    collection: MEMBERSHIP_COLLECTION,
    where: {
      flightPlan: {
        equals: flightPlan,
      },
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  const memberships: FlightPlanMembershipRecord[] = [];
  for (const doc of result.docs) {
    const record = toMembershipRecord(doc);
    if (record) memberships.push(record);
  }
  return memberships;
};

export const loadMembershipsForUser = async ({
  payload,
  userId,
  acceptedOnly = false,
  roles,
}: {
  payload: Payload;
  userId: IdLike;
  acceptedOnly?: boolean;
  roles?: FlightPlanRole[];
}): Promise<FlightPlanMembershipRecord[]> => {
  const user = normaliseId(userId);
  if (user == null) return [];

  type WhereClause = Record<string, unknown>;
  const conditions: WhereClause[] = [
    {
      user: {
        equals: user,
      },
    },
  ];

  if (acceptedOnly) {
    conditions.push({
      invitationStatus: {
        equals: 'accepted',
      },
    });
  }

  if (roles && roles.length) {
    conditions.push({
      role: {
        in: roles,
      },
    });
  }

  try {
    const result = await payload.find({
      collection: MEMBERSHIP_COLLECTION,
      // Payload's Where type is stricter than our normalized records; cast for compatibility.
      where: {
        and: conditions as any,
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    const memberships: FlightPlanMembershipRecord[] = [];
    for (const doc of result.docs) {
      const record = toMembershipRecord(doc);
      if (record) memberships.push(record);
    }
    return memberships;
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, userId: user, acceptedOnly, roles },
      '[flight-plan-membership] failed to load memberships for user',
    );
    return [];
  }
};

export const listCrewPreviewMemberIds = async ({
  payload,
  flightPlanIds,
  limit = 5,
}: {
  payload: Payload;
  flightPlanIds: IdLike[];
  limit?: number;
}): Promise<Map<number, number[]>> => {
  const ids = flightPlanIds
    .map((value) => normaliseId(value))
    .filter((value): value is number => value != null);

  if (!ids.length) {
    return new Map();
  }

  try {
    const result = await payload.find({
      collection: MEMBERSHIP_COLLECTION,
      where: {
        and: [
          { flightPlan: { in: ids } },
          {
            invitationStatus: {
              in: ['accepted'],
            },
          },
          {
            role: {
              in: ['owner', 'crew'],
            },
          },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    const grouped = new Map<number, FlightPlanMembershipRecord[]>();
    for (const doc of result.docs) {
      const record = toMembershipRecord(doc);
      if (!record) continue;
      if (record.status !== 'accepted') continue;
      if (record.role !== 'owner' && record.role !== 'crew') continue;
      const records = grouped.get(record.flightPlanId) ?? [];
      records.push(record);
      grouped.set(record.flightPlanId, records);
    }

    const rolePriority: Record<FlightPlanRole, number> = {
      owner: 0,
      crew: 1,
      guest: 2,
    };

    const previewMap = new Map<number, number[]>();

    grouped.forEach((records, planId) => {
      records.sort((a, b) => {
        const roleOrder = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99);
        if (roleOrder !== 0) return roleOrder;
        const timeA = a.respondedAt
          ? Date.parse(a.respondedAt)
          : a.invitedAt
            ? Date.parse(a.invitedAt)
            : 0;
        const timeB = b.respondedAt
          ? Date.parse(b.respondedAt)
          : b.invitedAt
            ? Date.parse(b.invitedAt)
            : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.userId - b.userId;
      });

      const idsForPlan: number[] = [];
      for (const record of records) {
        if (idsForPlan.includes(record.userId)) continue;
        idsForPlan.push(record.userId);
        if (idsForPlan.length >= limit) break;
      }
      if (idsForPlan.length) {
        previewMap.set(planId, idsForPlan);
      }
    });

    return previewMap;
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, flightPlanIds: ids },
      '[flight-plan-membership] failed to build crew preview map',
    );
    return new Map();
  }
};
