import type { NextRequest } from 'next/server';

import { can } from '@astralpirates/shared/authorization';
import { CREW_ROLES, isRoleAtLeast, type CrewRole } from '@astralpirates/shared/crewRoles';

import { corsEmpty, corsJson } from '../_lib/cors';
import { authenticateRequest, buildRequestForUser } from '../_lib/auth';
import {
  isLexicalDocument,
  normalizeFlightPlanSlideInputs,
  normalizeFlightPlanSlides,
  normalizeRichTextContent,
  resolveOwners,
  richTextContentToLexicalDocument,
  sanitizeFlightPlan,
} from '../_lib/content';
import {
  listCrewPreviewMemberIds,
  loadMembershipsForUser,
  type FlightPlanMembershipRecord,
  normaliseId,
} from '../_lib/flightPlanMembers';
import { resolveElsaBalance } from '../_lib/invite';
import {
  normalizeCrewRole,
  resolveCrewUserIdsByRoles,
  toCrewSummary,
  roleAtLeast,
  type CrewSummary,
} from '../_lib/crew';
import { ensureUniqueSlug, slugify } from '../_lib/slugs';
import { parseDateInput, parseLimit, sanitizeString } from '../_lib/requestParsing';
import { touchUserActivity } from '../_lib/userActivity';
import { notifyFlightPlanCreated } from '@/src/services/notifications/flightPlans';
import { refundElsa, spendElsa } from '@/src/services/elsaLedger';
import { canUserReadFlightPlan } from '../_lib/accessPolicy';
import { resolveFlightPlanMediaVisibility } from '../_lib/mediaGovernance';
import {
  parseFlightPlanBucketFilter,
  parseFlightPlanStatusFilters,
  resolveStatusesForBucket,
} from '../_lib/flightPlanLifecycle';

const METHODS = 'OPTIONS,GET,POST';

const normalizeAccessPolicyInput = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const normalizeMediaVisibilityInput = (
  value: unknown,
): 'inherit' | 'crew_only' | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'inherit' || normalized === 'crew_only') {
    return normalized;
  }
  return null;
};

const normalizeCategory = (value: unknown): 'test' | 'project' | 'event' | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'test' || trimmed === 'project' || trimmed === 'event') {
    return trimmed;
  }
  return null;
};

const normalizeCategoryFilters = (values: string[]): Array<'test' | 'project' | 'event'> => {
  const normalized = new Set<'test' | 'project' | 'event'>();
  for (const value of values) {
    const category = normalizeCategory(value);
    if (category) {
      normalized.add(category);
    }
  }
  return Array.from(normalized);
};

const canCreateFlightPlans = (user: { id?: unknown; role?: unknown } | null | undefined): boolean => {
  const websiteRole = normalizeCrewRole(user?.role);
  const userId = normaliseId(user?.id);
  return can('createFlightPlans', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole,
    },
  });
};

const parsePlanIdFilter = (
  value: string | null,
): { ok: true; id: number | null } | { ok: false; error: string } => {
  if (value == null) return { ok: true, id: null };
  const trimmed = value.trim();
  if (!trimmed.length) return { ok: true, id: null };
  if (!/^[0-9]+$/.test(trimmed)) {
    return { ok: false, error: 'id must be a positive integer.' };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: 'id must be a positive integer.' };
  }
  return { ok: true, id: parsed };
};

const toISODate = (date: Date): string => date.toISOString();

const formatDateCode = (date: Date): string => {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const formatDisplayDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limitParam = parseLimit(searchParams.get('limit'));
  const planIdFilterResult = parsePlanIdFilter(searchParams.get('id'));
  if (!planIdFilterResult.ok) {
    return corsJson(req, { error: planIdFilterResult.error }, { status: 400 }, METHODS);
  }
  const planIdFilter = planIdFilterResult.id;
  const ownerSlug = sanitizeString(searchParams.get('ownerSlug'));
  const memberSlug = sanitizeString(searchParams.get('memberSlug'));
  const minRoleFilter = normalizeCrewRole(searchParams.get('minRole'));
  const slugFilter = sanitizeString(searchParams.get('slug'));
  const categoryFilters = normalizeCategoryFilters(searchParams.getAll('category'));
  const statusFilterResult = parseFlightPlanStatusFilters(searchParams.getAll('status'));
  if (!statusFilterResult.ok) {
    return corsJson(req, { error: statusFilterResult.error }, { status: 400 }, METHODS);
  }
  const statusFilters = statusFilterResult.statuses;
  const bucketFilterResult = parseFlightPlanBucketFilter(searchParams.get('bucket'));
  if (!bucketFilterResult.ok) {
    return corsJson(req, { error: bucketFilterResult.error }, { status: 400 }, METHODS);
  }
  const bucketFilters = bucketFilterResult.bucket
    ? resolveStatusesForBucket(bucketFilterResult.bucket)
    : [];

  const auth = await authenticateRequest(req);
  const { payload, user } = auth;

  let viewerPlanIdSet: Set<number> | null = null;
  const viewerMembershipByPlan = new Map<number, FlightPlanMembershipRecord>();
  if (user) {
    try {
      const memberships = await loadMembershipsForUser({
        payload,
        userId: user.id,
        acceptedOnly: true,
      });
      if (memberships.length) {
        for (const membership of memberships) {
          if (typeof membership.flightPlanId === 'number' && Number.isFinite(membership.flightPlanId)) {
            viewerMembershipByPlan.set(membership.flightPlanId, membership);
          }
        }
        viewerPlanIdSet = new Set(
          memberships
            .map((membership) => membership.flightPlanId)
            .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
        );
      }
    } catch (error) {
      payload.logger?.warn?.({ err: error, userId: user.id }, 'Failed to load viewer memberships');
    }
  }

  let ownerIdFilter: number | null = null;
  if (ownerSlug) {
    try {
      const ownerResult = await payload.find({
        collection: 'users',
        where: {
          profileSlug: {
            equals: ownerSlug,
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (ownerResult.totalDocs > 0) {
        ownerIdFilter = ownerResult.docs[0].id;
        if (minRoleFilter && !isRoleAtLeast(normalizeCrewRole(ownerResult.docs[0].role), minRoleFilter)) {
          return corsJson(req, { plans: [], total: 0 }, {}, METHODS);
        }
      } else {
        return corsJson(req, { plans: [], total: 0 }, {}, METHODS);
      }
    } catch (error) {
      payload.logger.warn({ err: error, ownerSlug }, 'Failed to resolve owner for flight-plan query');
      return corsJson(req, { error: 'Unable to resolve owner filter.' }, { status: 500 }, METHODS);
    }
  }

  let memberPlanIds: number[] | null = null;
  if (memberSlug) {
    try {
      const memberResult = await payload.find({
        collection: 'users',
        where: {
          profileSlug: {
            equals: memberSlug,
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (!memberResult.totalDocs) {
        return corsJson(req, { plans: [], total: 0 }, {}, METHODS);
      }
      const memberId = memberResult.docs[0].id;
      const memberships = await loadMembershipsForUser({
        payload,
        userId: memberId,
        acceptedOnly: true,
      });
      const planIds = memberships
        .map((membership) => membership.flightPlanId)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
      if (!planIds.length) {
        return corsJson(req, { plans: [], total: 0 }, {}, METHODS);
      }
      memberPlanIds = planIds;
    } catch (error) {
      payload.logger.warn({ err: error, memberSlug }, 'Failed to resolve member for flight-plan query');
      return corsJson(req, { error: 'Unable to resolve member filter.' }, { status: 500 }, METHODS);
    }
  }

  let ownerCondition: Record<string, unknown> | undefined;
  if (slugFilter) {
    ownerCondition = undefined;
  } else if (ownerIdFilter != null) {
    ownerCondition = { equals: ownerIdFilter };
  } else if (minRoleFilter) {
    const permittedRoles = CREW_ROLES.filter((role) => isRoleAtLeast(role, minRoleFilter));
    if (!permittedRoles.length) {
      return corsJson(req, { plans: [], total: 0 }, {}, METHODS);
    }

    const ownerIds = await resolveCrewUserIdsByRoles(payload, permittedRoles);

    if (!ownerIds.length) {
      return corsJson(req, { plans: [], total: 0 }, {}, METHODS);
    }

    ownerCondition = { in: ownerIds };
  }

  try {
    const whereFilters: Record<string, unknown>[] = [];

    const visibilityFilters: Record<string, unknown>[] = [
      {
        isPublic: {
          equals: true,
        },
      },
      {
        visibility: {
          equals: 'public',
        },
      },
    ];
    if (viewerPlanIdSet?.size) {
      visibilityFilters.push({
        id: {
          in: Array.from(viewerPlanIdSet),
        },
      });
    }
    if (user) {
      visibilityFilters.push({
        publicContributions: {
          equals: true,
        },
      });
      visibilityFilters.push({
        owner: {
          equals: user.id,
        },
      });
    }
    whereFilters.push(
      visibilityFilters.length === 1 ? visibilityFilters[0] : { or: visibilityFilters },
    );

    if (planIdFilter != null) {
      whereFilters.push({
        id: {
          equals: planIdFilter,
        },
      });
    } else if (slugFilter) {
      whereFilters.push({
        slug: {
          equals: slugFilter,
        },
      });
    } else if (ownerCondition) {
      whereFilters.push({
        owner: ownerCondition,
      });
    }
    if (memberPlanIds && memberPlanIds.length) {
      whereFilters.push({
        id: {
          in: memberPlanIds,
        },
      });
    }
    if (categoryFilters.length === 1) {
      whereFilters.push({
        category: {
          equals: categoryFilters[0],
        },
      });
    } else if (categoryFilters.length > 1) {
      whereFilters.push({
        category: {
          in: categoryFilters,
        },
      });
    }
    if (statusFilters.length === 1) {
      whereFilters.push({
        status: {
          equals: statusFilters[0],
        },
      });
    } else if (statusFilters.length > 1) {
      whereFilters.push({
        status: {
          in: statusFilters,
        },
      });
    }
    if (bucketFilters.length === 1) {
      whereFilters.push({
        status: {
          equals: bucketFilters[0],
        },
      });
    } else if (bucketFilters.length > 1) {
      whereFilters.push({
        status: {
          in: bucketFilters,
        },
      });
    }

    const whereConditions =
      whereFilters.length === 0
        ? undefined
        : whereFilters.length === 1
          ? whereFilters[0]
          : { and: whereFilters };

    const result = await payload.find({
      collection: 'flight-plans',
      where: whereConditions as any,
      limit: slugFilter || planIdFilter != null ? 1 : limitParam,
      depth: 1,
      overrideAccess: false,
      sort: '-eventDate,-createdAt',
    });

    const readableDocs = result.docs.filter((doc) => {
      const planId = normaliseId((doc as any)?.id);
      const membership = planId != null ? viewerMembershipByPlan.get(planId) : null;
      return canUserReadFlightPlan({
        user,
        ownerId: (doc as any)?.owner,
        membershipRole: membership?.role ?? null,
        policy: (doc as any)?.accessPolicy,
        visibility: (doc as any)?.visibility,
        isPublic: (doc as any)?.isPublic,
        publicContributions: (doc as any)?.publicContributions,
        adminMode: auth.adminMode,
      });
    });

    let ownerMap = await resolveOwners(payload, readableDocs);
    let crewPreviewMap: Map<number, number[]> | null = null;

    if (readableDocs.length) {
      const planIds = readableDocs
        .map((doc) => normaliseId((doc as any)?.id))
        .filter((id): id is number => id != null);
      if (planIds.length) {
        const previewMembers = await listCrewPreviewMemberIds({
          payload,
          flightPlanIds: planIds,
          limit: 5,
        });
        if (previewMembers.size) {
          const previewOwnerDocs = Array.from(
            new Set(
              Array.from(previewMembers.values())
                .flat()
                .filter((id) => typeof id === 'number'),
            ),
          ).map((userId) => ({ owner: userId }));
          ownerMap = await resolveOwners(payload, previewOwnerDocs, ownerMap);
          crewPreviewMap = previewMembers;
        }
      }
    }

    const sanitized = readableDocs.map((doc) =>
      sanitizeFlightPlan(doc, ownerMap, crewPreviewMap ?? undefined),
    );
    const filtered = minRoleFilter
      ? sanitized.filter((entry) => entry.owner && roleAtLeast(entry.owner.role, minRoleFilter))
      : sanitized;
    const limited = filtered.slice(0, limitParam);

    return corsJson(req, { plans: limited, total: filtered.length }, {}, METHODS);
  } catch (error) {
    payload.logger.error({ err: error }, 'Failed to fetch flight plans');
    return corsJson(req, { error: 'Unable to load flight plans.' }, { status: 500 }, METHODS);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  if (!canCreateFlightPlans(auth.user)) {
    return corsJson(req, { error: 'Insufficient rank to create flight plans.' }, { status: 403 }, METHODS);
  }

  let payloadBody: any = null;
  try {
    payloadBody = await req.json();
  } catch (error) {
    return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
  }

  const title = sanitizeString(payloadBody?.title);
  const summary = sanitizeString(payloadBody?.summary);
  const rawBody = payloadBody?.body;
  const body = normalizeRichTextContent(rawBody);
  const location = sanitizeString(payloadBody?.location);
  const displayDateInput = sanitizeString(payloadBody?.displayDate);
  const eventDateValue = parseDateInput(payloadBody?.eventDate);
  const gallerySlides = normalizeFlightPlanSlideInputs(payloadBody?.gallerySlides);
  const publicContributions = Boolean(payloadBody?.publicContributions);
  const visibility = sanitizeString(payloadBody?.visibility);
  const accessPolicy = normalizeAccessPolicyInput(payloadBody?.accessPolicy);
  const mediaVisibilityProvided = Object.prototype.hasOwnProperty.call(
    payloadBody ?? {},
    'mediaVisibility',
  );
  const mediaVisibilityInput = mediaVisibilityProvided
    ? normalizeMediaVisibilityInput(payloadBody?.mediaVisibility)
    : null;
  const categoryProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'category');
  const categoryValue = normalizeCategory(payloadBody?.category);
  const category = categoryValue ?? 'project';

  if (categoryProvided && !categoryValue) {
    return corsJson(req, { error: 'Category must be one of: test, project, event.' }, { status: 400 }, METHODS);
  }

  if (!title || body.length === 0) {
    return corsJson(req, { error: 'Title and body are required.' }, { status: 400 }, METHODS);
  }

  if (mediaVisibilityProvided && !mediaVisibilityInput) {
    return corsJson(
      req,
      { error: 'mediaVisibility must be one of: inherit, crew_only.' },
      { status: 400 },
      METHODS,
    );
  }

  const user = auth.user;
  const eventDate = eventDateValue ?? new Date();
  const dateCode = formatDateCode(eventDate);
  const eventDateISO = toISODate(eventDate);
  const displayDate = displayDateInput ?? formatDisplayDate(eventDate);

  const reqForUser = await buildRequestForUser(auth.payload, user);
  const elsaBalance = resolveElsaBalance((user as any)?.elsaTokens);
  if (elsaBalance <= 0) {
    return corsJson(
      req,
      { error: 'You need at least one E.L.S.A. to chart a new mission.' },
      { status: 403 },
      METHODS,
    );
  }

  let spendResult: Awaited<ReturnType<typeof spendElsa>> | null = null;

  try {
    spendResult = await spendElsa({
      payload: auth.payload,
      userId: user.id,
      amount: 1,
      type: 'spend',
      metadata: {
        reason: 'flight_plan_create',
        title,
      },
      idempotencyKey: req.headers.get('x-request-id'),
    });
    (user as any).elsaTokens = spendResult.balanceAfter;
  } catch (error) {
    auth.payload.logger.error(
      { err: error, userId: user.id },
      'Failed to deduct E.L.S.A. for flight plan creation',
    );
    return corsJson(
      req,
      { error: 'Unable to spend an E.L.S.A. right now. Please try again shortly.' },
      { status: 500 },
      METHODS,
    );
  }

  const remainingElsa = spendResult?.balanceAfter ?? Math.max(0, elsaBalance - 1);

  const refundElsaOnFailure = async () => {
    if (!spendResult?.applied) return;
    try {
      await refundElsa({
        payload: auth.payload,
        userId: user.id,
        amount: 1,
        type: 'refund',
        metadata: {
          reason: 'flight_plan_create_refund',
        },
        idempotencyKey: `flight-plan-refund:${spendResult.transaction.id}`,
      });
      (user as any).elsaTokens = elsaBalance;
    } catch (refundError) {
      auth.payload.logger.error(
        { err: refundError, userId: user.id },
        'Failed to restore E.L.S.A. after flight plan failure',
      );
    }
  };

  try {
    const baseSlug = `${dateCode}-${slugify(title)}`;
    const slug = await ensureUniqueSlug(auth.payload, 'flight-plans', baseSlug);
    const path = `bridge/flightplan/events/${slug}`;

    const lexicalBody = isLexicalDocument(rawBody) ? rawBody : richTextContentToLexicalDocument(body);
    const createData: Record<string, unknown> = {
      title,
      summary,
      body: lexicalBody as any,
      location,
      slug,
      path,
      dateCode,
      displayDate,
      eventDate: eventDateISO,
      gallerySlides,
      publicContributions,
      visibility,
      mediaVisibility: resolveFlightPlanMediaVisibility(mediaVisibilityInput),
      category,
    };
    if (accessPolicy) {
      createData.accessPolicy = accessPolicy;
    }

    const doc = await auth.payload.create({
      collection: 'flight-plans',
      data: createData as any,
      draft: false,
      req: reqForUser,
      depth: 1,
    });

    if (auth.user?.id != null) {
      await touchUserActivity(auth.payload, auth.user.id, 'flight plan creation');
    }

    const ownerSummary = toCrewSummary(auth.user);
    const ownerMap = new Map<number, CrewSummary>();
    if (ownerSummary) ownerMap.set(auth.user.id, ownerSummary);

    await notifyFlightPlanCreated({
      payload: auth.payload,
      ownerId: auth.user.id,
      planSlug: slug,
      planTitle: title,
      remainingElsa,
    });

    return corsJson(req, { plan: sanitizeFlightPlan(doc, ownerMap) }, { status: 201 }, METHODS);
  } catch (error) {
    await refundElsaOnFailure();
    auth.payload.logger.error({ err: error }, 'Failed to create flight plan');
    return corsJson(req, { error: error instanceof Error ? error.message : 'Failed to create flight plan.' }, { status: 400 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
