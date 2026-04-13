import type { NextRequest } from 'next/server';

import { CREW_ROLES, isRoleAtLeast, type CrewRole } from '@astralpirates/shared/crewRoles';
import type { LogSummary } from '@astralpirates/shared/api-contracts';

import { corsEmpty, corsJson } from '../_lib/cors';
import { authenticateRequest, buildRequestForUser } from '../_lib/auth';
import { resolveOwners, sanitizeLog } from '../_lib/content';
import {
  normalizeCrewRole,
  resolveCrewUserIdsByRoles,
  toCrewSummary,
  roleAtLeast,
  type CrewSummary,
} from '../_lib/crew';
import { ensureUniqueSlug } from '../_lib/slugs';
import { loadMembership } from '../_lib/flightPlanMembers';
import { parseDateInput, parseLimit, sanitizeString } from '../_lib/requestParsing';
import { touchUserActivity } from '../_lib/userActivity';
import { formatLogTitle } from '@/src/utils/logTitles';
import {
  TIMESTAMP_SLUG_PATTERN,
  buildLogPath,
  deriveCallSignToken,
  formatTimestamp,
  timestampSlugToDate,
  toTimestampLabel,
} from '@astralpirates/shared/logs';

const METHODS = 'OPTIONS,GET,POST';

const collectStringParams = (searchParams: URLSearchParams, keys: string[], delimiter = ','): string[] => {
  const values: string[] = [];
  keys.forEach((key) => {
    searchParams.getAll(key).forEach((entry) => {
      if (typeof entry !== 'string') return;
      if (delimiter && entry.includes(delimiter)) {
        values.push(...entry.split(delimiter));
      } else {
        values.push(entry);
      }
    });
  });
  return values
    .map((value) => sanitizeString(value))
    .filter((value): value is string => Boolean(value));
};

const normalizeFlightPlanId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normalizeFlightPlanId((value as { id?: unknown }).id);
  }
  return null;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limitParam = parseLimit(searchParams.get('limit'));
  const minRoleFilter = normalizeCrewRole(searchParams.get('minRole'));
  const slugFilter = sanitizeString(searchParams.get('slug'));
  const createdBefore = parseDateInput(searchParams.get('createdBefore'));
  const createdAfter = parseDateInput(searchParams.get('createdAfter'));
  const ownerSlugFilters = new Set(
    collectStringParams(searchParams, ['owner', 'ownerSlug', 'owners']).map((slug) => slug.toLowerCase()),
  );
  const roleFilters = new Set<CrewRole>();
  collectStringParams(searchParams, ['role', 'roles']).forEach((entry) => {
    const normalized = normalizeCrewRole(entry);
    if (normalized) roleFilters.add(normalized);
  });

  const { payload } = await authenticateRequest(req);

  let ownerIdFilters: number[] = [];

  if (ownerSlugFilters.size > 0) {
    try {
      const ownerResult = await payload.find({
        collection: 'users',
        where:
          ownerSlugFilters.size === 1
            ? {
                profileSlug: {
                  equals: Array.from(ownerSlugFilters)[0],
                },
              }
            : {
                profileSlug: {
                  in: Array.from(ownerSlugFilters),
                },
              },
        limit: ownerSlugFilters.size,
        depth: 0,
        overrideAccess: true,
      });
      if (ownerResult.totalDocs === 0) {
        return corsJson(req, { logs: [], total: 0 }, {}, METHODS);
      }
      const ids = ownerResult.docs
        .filter((user) => (user as { profileSlug?: string }).profileSlug)
        .map((user) => user.id as number);
      if (!ids.length) {
        return corsJson(req, { logs: [], total: 0 }, {}, METHODS);
      }
      if (minRoleFilter) {
        const permittedIds = ownerResult.docs
          .filter((user) => isRoleAtLeast(normalizeCrewRole((user as { role?: unknown }).role), minRoleFilter))
          .map((user) => user.id as number);
        if (!permittedIds.length) {
          return corsJson(req, { logs: [], total: 0 }, {}, METHODS);
        }
        ownerIdFilters = permittedIds;
      } else {
        ownerIdFilters = ids;
      }
    } catch (error) {
      payload.logger.warn({ err: error, ownerSlugFilters: Array.from(ownerSlugFilters) }, 'Failed to resolve owners');
      return corsJson(req, { error: 'Unable to resolve owner filter.' }, { status: 500 }, METHODS);
    }
  }

  let ownerCondition: Record<string, unknown> | undefined;
  if (slugFilter) {
    ownerCondition = undefined;
  } else if (ownerIdFilters.length === 1) {
    ownerCondition = { equals: ownerIdFilters[0] };
  } else if (ownerIdFilters.length > 1) {
    ownerCondition = { in: ownerIdFilters };
  } else if (roleFilters.size > 0) {
    const ownerIds = await resolveCrewUserIdsByRoles(payload, Array.from(roleFilters));

    if (!ownerIds.length) {
      return corsJson(req, { logs: [], total: 0 }, {}, METHODS);
    }

    ownerCondition = ownerIds.length === 1 ? { equals: ownerIds[0] } : { in: ownerIds };
  } else if (minRoleFilter) {
    const permittedRoles = CREW_ROLES.filter((role) => isRoleAtLeast(role, minRoleFilter));
    if (!permittedRoles.length) {
      return corsJson(req, { logs: [], total: 0 }, {}, METHODS);
    }

    const ownerIds = await resolveCrewUserIdsByRoles(payload, permittedRoles);

    if (!ownerIds.length) {
      return corsJson(req, { logs: [], total: 0 }, {}, METHODS);
    }

    ownerCondition = { in: ownerIds };
  }

  try {
    const whereClauses: Record<string, unknown>[] = [];
    if (slugFilter) {
      whereClauses.push({
        slug: {
          equals: slugFilter,
        },
      });
    }
    if (ownerCondition) {
      whereClauses.push({
        owner: ownerCondition,
      });
    }
    if (createdBefore) {
      whereClauses.push({
        createdAt: {
          less_than: createdBefore.toISOString(),
        },
      });
    }
    if (createdAfter) {
      whereClauses.push({
        createdAt: {
          greater_than: createdAfter.toISOString(),
        },
      });
    }

    const whereConditions =
      whereClauses.length === 0
        ? undefined
        : whereClauses.length === 1
          ? whereClauses[0]
          : { and: whereClauses };

    const limit = slugFilter ? 1 : limitParam;
    let sort: string = '-logDate,-createdAt';
    if (createdAfter && !createdBefore && !slugFilter) {
      sort = 'logDate,createdAt';
    }

    const result = await payload.find({
      collection: 'logs',
      where: whereConditions as any,
      limit,
      depth: 0,
      overrideAccess: false,
      sort,
    });

    const ownerMap = await resolveOwners(payload, result.docs);

    const sanitized: LogSummary[] = result.docs.map((doc) => sanitizeLog(doc, ownerMap) as LogSummary);

    const filtered = minRoleFilter
      ? sanitized.filter((entry) => {
          const role = normalizeCrewRole(entry.owner?.role ?? null);
          return role != null && roleAtLeast(role, minRoleFilter);
        })
      : sanitized;

    const ownerSlugMatchSet =
      ownerSlugFilters.size > 0
        ? new Set(Array.from(ownerSlugFilters).map((slug) => slug.toLowerCase()))
        : null;

    const matchesRoleFilter = (entry: LogSummary): boolean => {
      if (!roleFilters.size) return true;
      const role = normalizeCrewRole(entry.owner?.role ?? null);
      if (!role) return false;
      return roleFilters.has(role);
    };

    const matchesOwnerSlugFilter = (entry: LogSummary): boolean => {
      if (!ownerSlugMatchSet || !ownerSlugMatchSet.size) return true;
      const slug = typeof entry.owner?.profileSlug === 'string' ? entry.owner.profileSlug.toLowerCase() : null;
      if (!slug) return false;
      return ownerSlugMatchSet.has(slug);
    };

    const fullyFiltered = filtered.filter(
      (entry) => matchesRoleFilter(entry) && matchesOwnerSlugFilter(entry),
    );
    const limited = fullyFiltered.slice(0, limit);

    return corsJson(req, { logs: limited, total: fullyFiltered.length }, {}, METHODS);
  } catch (error) {
    payload.logger.error({ err: error }, 'Failed to fetch logs');
    return corsJson(req, { error: 'Unable to load logs.' }, { status: 500 }, METHODS);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  let payloadBody: any = null;
  try {
    payloadBody = await req.json();
  } catch (error) {
    return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
  }

  const body = sanitizeString(payloadBody?.body);
  if (!body) {
    return corsJson(req, { error: 'Body is required.' }, { status: 400 }, METHODS);
  }

  const headline = sanitizeString(payloadBody?.title);
  if (!headline) {
    return corsJson(req, { error: 'Title is required.' }, { status: 400 }, METHODS);
  }
  if (headline.length > 50) {
    return corsJson(req, { error: 'Title must be 50 characters or fewer.' }, { status: 400 }, METHODS);
  }

  const rawFlightPlanValue = payloadBody?.flightPlanId ?? payloadBody?.flightPlan ?? null;
  const flightPlanId = normalizeFlightPlanId(rawFlightPlanValue);
  if (flightPlanId != null) {
    const membership = await loadMembership(auth.payload, flightPlanId, auth.user.id);
    if (
      !membership ||
      membership.status !== 'accepted' ||
      (membership.role !== 'owner' && membership.role !== 'crew')
    ) {
      return corsJson(
        req,
        { error: 'Only crew members can attach logs to this flight plan.' },
        { status: 403 },
        METHODS,
      );
    }
  }

  const now = new Date();
  const { stamp: baseStamp, slug: baseSlug } = toTimestampLabel(now);

  try {
    const slug = await ensureUniqueSlug(auth.payload, 'logs', baseSlug);
    const stampedDate = timestampSlugToDate(slug) ?? now;
    const finalStamp = TIMESTAMP_SLUG_PATTERN.test(slug)
      ? slug
      : baseStamp ?? formatTimestamp(stampedDate);
    const path = buildLogPath(slug);
    const ownerCallSign = deriveCallSignToken(auth.user ?? null);
    const finalTitle = formatLogTitle({ stamp: finalStamp, callSign: ownerCallSign, note: headline });
    const reqForUser = await buildRequestForUser(auth.payload, auth.user);

    const doc = await auth.payload.create({
      collection: 'logs',
      data: {
        title: finalTitle,
        headline,
        body,
        slug,
        path,
        dateCode: finalStamp,
        logDate: stampedDate.toISOString(),
        flightPlan: flightPlanId ?? undefined,
      },
      draft: false,
      req: reqForUser,
    });

    if (auth.user?.id != null) {
      await touchUserActivity(auth.payload, auth.user.id, 'log creation');
    }

    const ownerSummary = toCrewSummary(auth.user);
    const ownerMap = new Map<number, CrewSummary>();
    if (ownerSummary) ownerMap.set(auth.user.id, ownerSummary);

    return corsJson(req, { log: sanitizeLog(doc, ownerMap) }, { status: 201 }, METHODS);
  } catch (error) {
    auth.payload.logger.error({ err: error }, 'Failed to create log entry');
    return corsJson(req, { error: error instanceof Error ? error.message : 'Failed to create log.' }, { status: 400 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
