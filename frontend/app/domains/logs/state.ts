import { computed, isRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { ZodType } from 'zod';
import { useAstralFetch } from '~/modules/api';
import { normalizeAvatarMediaRecord } from '~/modules/media/avatarMedia';
import {
  FlightPlansResponseSchema,
  LogsResponseSchema,
  type FlightPlansResponse,
  type LogsResponse,
} from '@astralpirates/shared/api-contracts';

type MaybeRefOrGetter<T> = T | Ref<T> | (() => T);

type SharedPaginatedParams = {
  ownerSlug?: () => string | null | undefined;
  limit?: MaybeRefOrGetter<number>;
  minRole?: MaybeRefOrGetter<string | null>;
};

export type LogbookParams = SharedPaginatedParams & {
  roles?: MaybeRefOrGetter<string[] | null | undefined>;
  owners?: MaybeRefOrGetter<string[] | null | undefined>;
};

export type FlightPlansParams = SharedPaginatedParams & {
  memberSlug?: () => string | null | undefined;
  categories?: MaybeRefOrGetter<string[] | null | undefined>;
  statuses?: MaybeRefOrGetter<string[] | null | undefined>;
  bucket?: MaybeRefOrGetter<string | null | undefined>;
};

type PaginatedFetcherParams = SharedPaginatedParams & {
  roles?: MaybeRefOrGetter<string[] | null | undefined>;
  owners?: MaybeRefOrGetter<string[] | null | undefined>;
  memberSlug?: () => string | null | undefined;
  categories?: MaybeRefOrGetter<string[] | null | undefined>;
  statuses?: MaybeRefOrGetter<string[] | null | undefined>;
  bucket?: MaybeRefOrGetter<string | null | undefined>;
};

type QueryPolicy = {
  includeRoleFilters?: boolean;
  includeOwnerFilters?: boolean;
  includeMemberSlug?: boolean;
  includeCategoryFilters?: boolean;
  includeStatusFilters?: boolean;
  includeBucketFilter?: boolean;
};

const resolveMaybeRef = <T>(source: MaybeRefOrGetter<T> | undefined, fallback: T) =>
  computed<T>(() => {
    if (typeof source === 'function') {
      return (source as () => T)();
    }
    if (isRef(source)) {
      return (source as Ref<T>).value;
    }
    return (source ?? fallback) as T;
  });

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

const normalizeLifecycleBucket = (
  value: unknown,
): 'active' | 'finished' | 'archived' | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'finished' || normalized === 'archived') {
    return normalized;
  }
  return null;
};

const normalizeCrewSummaryAvatar = <
  T extends {
    avatarUrl?: string | null;
    avatarMediaType?: unknown;
    avatarMediaUrl?: string | null;
    avatarMimeType?: string | null;
    avatarFilename?: string | null;
  },
>(
  member: T,
): T => {
  const normalized = normalizeAvatarMediaRecord({
    avatarUrl: member.avatarUrl ?? null,
    avatarMediaType: member.avatarMediaType,
    avatarMediaUrl: member.avatarMediaUrl ?? null,
    avatarMimeType: member.avatarMimeType ?? null,
    avatarFilename: member.avatarFilename ?? null,
  });
  const unchanged =
    normalized.avatarUrl === (member.avatarUrl ?? null) &&
    normalized.avatarMediaType === (member.avatarMediaType ?? null) &&
    normalized.avatarMediaUrl === (member.avatarMediaUrl ?? null) &&
    normalized.avatarMimeType === (member.avatarMimeType ?? null) &&
    normalized.avatarFilename === (member.avatarFilename ?? null);
  if (unchanged) return member;
  return {
    ...member,
    avatarUrl: normalized.avatarUrl,
    avatarMediaType: normalized.avatarMediaType,
    avatarMediaUrl: normalized.avatarMediaUrl,
    avatarMimeType: normalized.avatarMimeType,
    avatarFilename: normalized.avatarFilename,
  };
};

const normalizeLogsResponseAvatarUrls = (response: LogsResponse): LogsResponse => {
  let changed = false;
  const logs = response.logs.map((log) => {
    if (!log.owner) return log;
    const owner = normalizeCrewSummaryAvatar(log.owner);
    if (owner === log.owner) return log;
    changed = true;
    return {
      ...log,
      owner,
    };
  });
  if (!changed) return response;
  return {
    ...response,
    logs,
  };
};

const normalizeFlightPlansResponseAvatarUrls = (
  response: FlightPlansResponse,
): FlightPlansResponse => {
  let changed = false;
  const plans = response.plans.map((plan) => {
    const owner = plan.owner ? normalizeCrewSummaryAvatar(plan.owner) : plan.owner;
    const crewPreview = plan.crewPreview.map((member) => normalizeCrewSummaryAvatar(member));
    const ownerChanged = owner !== plan.owner;
    const crewChanged = crewPreview.some((member, index) => member !== plan.crewPreview[index]);
    if (!ownerChanged && !crewChanged) return plan;
    changed = true;
    return {
      ...plan,
      owner,
      crewPreview,
    };
  });
  if (!changed) return response;
  return {
    ...response,
    plans,
  };
};

const createPaginatedFetcher = <TResponse>(options: {
  endpoint: string;
  keyPrefix: string;
  schema: ZodType<TResponse>;
  defaultValue: () => TResponse;
  transform?: (response: TResponse) => TResponse;
  queryPolicy?: QueryPolicy;
}) => {
  return (params: PaginatedFetcherParams) => {
    const includeRoleFilters = options.queryPolicy?.includeRoleFilters === true;
    const includeOwnerFilters = options.queryPolicy?.includeOwnerFilters === true;
    const includeMemberSlug = options.queryPolicy?.includeMemberSlug === true;
    const includeCategoryFilters = options.queryPolicy?.includeCategoryFilters === true;
    const includeStatusFilters = options.queryPolicy?.includeStatusFilters === true;
    const includeBucketFilter = options.queryPolicy?.includeBucketFilter === true;

    const rawOwnerSlug = computed(() => params.ownerSlug?.() ?? null);
    const slug = computed(() => {
      const value = rawOwnerSlug.value;
      return value ? value.trim().toLowerCase() : null;
    });
    const rawMemberSlug = computed(() => params.memberSlug?.() ?? null);
    const memberSlug = computed(() => {
      const value = rawMemberSlug.value;
      return value ? value.trim().toLowerCase() : null;
    });
    const limit = resolveMaybeRef(params.limit, 10);
    const minRole = resolveMaybeRef(params.minRole, null);
    const rawRoles = resolveMaybeRef(params.roles, [] as string[]);
    const rawOwners = resolveMaybeRef(params.owners, [] as string[]);
    const rawCategories = resolveMaybeRef(params.categories, [] as string[]);
    const rawStatuses = resolveMaybeRef(params.statuses, [] as string[]);
    const rawBucket = resolveMaybeRef(params.bucket, null as string | null);
    const roleFilters = computed(() => normalizeStringArray(rawRoles.value).map((role) => role.toLowerCase()));
    const ownerFilters = computed(() => normalizeStringArray(rawOwners.value));
    const rolesKey = computed(() =>
      roleFilters.value.length ? [...roleFilters.value].sort().join('|') : 'all',
    );
    const ownersKey = computed(() =>
      ownerFilters.value.length ? [...ownerFilters.value].sort().join('|') : 'all',
    );
    const categoryFilters = computed(() =>
      normalizeStringArray(rawCategories.value).map((category) => category.toLowerCase()),
    );
    const categoriesKey = computed(() =>
      categoryFilters.value.length ? [...categoryFilters.value].sort().join('|') : 'all',
    );
    const statusFilters = computed(() =>
      normalizeStringArray(rawStatuses.value).map((status) => status.toLowerCase()),
    );
    const statusesKey = computed(() =>
      statusFilters.value.length ? [...statusFilters.value].sort().join('|') : 'all',
    );
    const bucketFilter = computed(() => normalizeLifecycleBucket(rawBucket.value));

    const shouldFetch = computed(() => {
      const ownerReady = !params.ownerSlug || rawOwnerSlug.value === null || Boolean(slug.value);
      const memberReady =
        !includeMemberSlug ||
        !params.memberSlug ||
        rawMemberSlug.value === null ||
        Boolean(memberSlug.value);
      return ownerReady && memberReady;
    });

    const request = computed(() => {
      const query = new URLSearchParams();
      if (slug.value) query.set('ownerSlug', slug.value);
      if (minRole.value) query.set('minRole', minRole.value);
      if (includeMemberSlug && memberSlug.value) query.set('memberSlug', memberSlug.value);
      if (includeRoleFilters) {
        roleFilters.value.forEach((role) => query.append('role', role));
      }
      if (includeOwnerFilters) {
        ownerFilters.value.forEach((owner) => query.append('owner', owner));
      }
      if (includeCategoryFilters) {
        categoryFilters.value.forEach((category) => query.append('category', category));
      }
      if (includeStatusFilters) {
        statusFilters.value.forEach((status) => query.append('status', status));
      }
      if (includeBucketFilter && bucketFilter.value) {
        query.set('bucket', bucketFilter.value);
      }
      query.set('limit', String(limit.value));
      const paramsString = query.toString();
      return paramsString ? `${options.endpoint}?${paramsString}` : options.endpoint;
    });

    const keyParts = computed(() => {
      const parts = [
        options.keyPrefix,
        slug.value ?? 'all',
        String(limit.value),
        minRole.value ?? 'any',
      ];
      if (includeMemberSlug) parts.push(memberSlug.value ?? 'all-members');
      if (includeRoleFilters) parts.push(rolesKey.value);
      if (includeOwnerFilters) parts.push(ownersKey.value);
      if (includeCategoryFilters) parts.push(categoriesKey.value);
      if (includeStatusFilters) parts.push(statusesKey.value);
      if (includeBucketFilter) parts.push(bucketFilter.value ?? 'all-buckets');
      return parts.join('-');
    });

    const result = useAstralFetch<TResponse>(() => request.value, {
      key: () => keyParts.value,
      immediate: false,
      default: options.defaultValue,
      schema: options.schema,
      transform: options.transform,
    });

    const watchSources: any[] = [slug, limit, minRole];
    if (includeMemberSlug) watchSources.push(memberSlug);
    if (includeRoleFilters) watchSources.push(roleFilters);
    if (includeOwnerFilters) watchSources.push(ownerFilters);
    if (includeCategoryFilters) watchSources.push(categoryFilters);
    if (includeStatusFilters) watchSources.push(statusFilters);
    if (includeBucketFilter) watchSources.push(bucketFilter);

    watch(
      watchSources,
      () => {
        if (shouldFetch.value) result.execute();
      },
      { immediate: true, deep: true },
    );

    return result;
  };
};

const useLogbookFetcher = createPaginatedFetcher<LogsResponse>({
  endpoint: '/api/logs',
  keyPrefix: 'logs',
  schema: LogsResponseSchema,
  defaultValue: () => ({ logs: [], total: 0 }),
  transform: normalizeLogsResponseAvatarUrls,
  queryPolicy: {
    includeRoleFilters: true,
    includeOwnerFilters: true,
  },
});

const useFlightPlansFetcher = createPaginatedFetcher<FlightPlansResponse>({
  endpoint: '/api/flight-plans',
  keyPrefix: 'flight-plans',
  schema: FlightPlansResponseSchema,
  defaultValue: () => ({ plans: [], total: 0 }),
  transform: normalizeFlightPlansResponseAvatarUrls,
  queryPolicy: {
    includeMemberSlug: true,
    includeCategoryFilters: true,
    includeStatusFilters: true,
    includeBucketFilter: true,
  },
});

export const useLogbook = (params: LogbookParams) => useLogbookFetcher(params);
export const useFlightPlans = (params: FlightPlansParams) => useFlightPlansFetcher(params);
