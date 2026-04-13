import {
  PlanDetailResponseSchema,
  PlanLinkSchema,
  PlanSchema,
  PlansCmsResponseSchema,
  PlansResponseSchema,
  type Plan,
  type PlanDetailResponse,
  type PlansCmsResponse,
  type PlansResponse,
} from './api-contracts';
import { normalizeAccessPolicy } from './accessPolicy';

export type FetchPlansOptions = {
  baseUrl?: string | null;
  limit?: number;
  depth?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onError?: (error: Error, context: { endpoint: string }) => void;
};

export type FetchPlanDetailOptions = {
  baseUrl?: string | null;
  slug: string;
  depth?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onError?: (error: Error, context: { endpoint: string }) => void;
};

const DEFAULT_LIMIT = 200;

const trimTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
};

const sanitizeBaseUrl = (baseUrl: string) => trimTrailingSlashes(baseUrl);

export const buildPlansCmsEndpoint = (
  baseUrl: string,
  limit: number = DEFAULT_LIMIT,
  depth: number = 1,
) => {
  const trimmed = sanitizeBaseUrl(baseUrl);
  const params = new URLSearchParams({
    limit: String(limit),
    depth: String(depth),
    sort: 'planId',
  });
  return `${trimmed}/api/plans?${params.toString()}`;
};

export const buildPlanDetailCmsEndpoint = (
  baseUrl: string,
  slug: string,
  depth: number = 1,
) => {
  const trimmed = sanitizeBaseUrl(baseUrl);
  const params = new URLSearchParams({
    limit: '1',
    depth: String(depth),
    'where[or][0][slug][equals]': slug,
    'where[or][1][planId][equals]': slug,
  });
  return `${trimmed}/api/plans?${params.toString()}`;
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const statusSet = new Set<Plan['status']>(['queued', 'active', 'shipped', 'tested', 'canceled']);
const cloudStatusSet = new Set(['pending', 'deploying', 'healthy']);

const normaliseStatus = <T extends string>(value: unknown, fallback: T, allowed: Set<T>): T => {
  const candidate = nullableString(value);
  if (!candidate) return fallback;
  const lower = candidate.toLowerCase() as T;
  return allowed.has(lower) ? lower : fallback;
};

const normaliseLinks = (links: unknown): Plan['links'] => {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      const parsed = PlanLinkSchema.safeParse(link);
      if (!parsed.success) return null;
      const url = nullableString(parsed.data.url);
      const label = nullableString(parsed.data.label);
      if (!url) return null;
      return {
        url,
        label: label ?? url,
      };
    })
    .filter(Boolean) as Plan['links'];
};

const normalisePlan = (plan: PlansCmsResponse['docs'][number]): Plan | null => {
  const id = nullableString((plan as any).planId ?? plan.slug ?? plan.id);
  const slug = nullableString((plan as any).slug ?? plan.planId ?? plan.id);
  const title = nullableString(plan.title);
  if (!id || !slug || !title) return null;

  const bodyResult = PlanSchema.shape.body.safeParse((plan as any).body ?? []);

  return {
    id,
    slug,
    title,
    owner: nullableString(plan.owner),
    accessPolicy: normalizeAccessPolicy((plan as any).accessPolicy),
    tier: nullableString(plan.tier) ?? 'meta',
    status: normaliseStatus((plan as any).status, 'queued', statusSet),
    cloudStatus: nullableString((plan as any).cloudStatus) ?? 'pending',
    summary: nullableString(plan.summary),
    lastUpdated: nullableString((plan as any).lastUpdated),
    path: nullableString((plan as any).path),
    links: normaliseLinks((plan as any).links),
    body: bodyResult.success ? bodyResult.data : [],
  };
};

const normaliseCmsResponse = (payload: PlansCmsResponse): PlansResponse => {
  const plans = (payload.docs ?? []).map(normalisePlan).filter(Boolean) as Plan[];
  const parsed = PlansResponseSchema.safeParse({
    generatedAt: new Date().toISOString(),
    plans,
  });
  if (parsed.success) return parsed.data;
  return { generatedAt: null, plans: [] };
};

export const normalizePlansCmsResponse = (payload: PlansCmsResponse): PlansResponse =>
  normaliseCmsResponse(payload);

export const fetchPlansFromCms = async (
  options: FetchPlansOptions = {},
): Promise<PlansResponse | null> => {
  const {
    baseUrl,
    limit = DEFAULT_LIMIT,
    depth = 1,
    signal,
    fetchImpl = globalThis.fetch,
    onError,
  } = options;
  if (!baseUrl || typeof fetchImpl !== 'function') {
    return null;
  }

  const endpoint = buildPlansCmsEndpoint(baseUrl, limit, depth);

  try {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const parsed = PlansCmsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`[plans] Invalid CMS response (${endpoint}): ${parsed.error.message}`);
    }

    return normaliseCmsResponse(parsed.data);
  } catch (error: any) {
    if (typeof onError === 'function') {
      onError(error instanceof Error ? error : new Error(String(error)), { endpoint });
    }
    return null;
  }
};

export const fetchPlanDetailFromCms = async (
  options: FetchPlanDetailOptions,
): Promise<Plan | null> => {
  const {
    baseUrl,
    slug,
    depth = 1,
    signal,
    fetchImpl = globalThis.fetch,
    onError,
  } = options;
  const trimmedSlug = slug.trim();
  if (!baseUrl || !trimmedSlug || typeof fetchImpl !== 'function') {
    return null;
  }

  const endpoint = buildPlanDetailCmsEndpoint(baseUrl, trimmedSlug, depth);
  try {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const parsed = PlansCmsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`[plans] Invalid CMS response (${endpoint}): ${parsed.error.message}`);
    }

    const normalized = normaliseCmsResponse(parsed.data);
    return normalized.plans[0] ?? null;
  } catch (error: any) {
    if (typeof onError === 'function') {
      onError(error instanceof Error ? error : new Error(String(error)), { endpoint });
    }
    return null;
  }
};

export const normalizePlanDetail = (plan: Plan | null | undefined): PlanDetailResponse => {
  const parsed = PlanDetailResponseSchema.safeParse({
    generatedAt: new Date().toISOString(),
    plan: plan ?? null,
  });
  if (parsed.success) return parsed.data;
  return { generatedAt: null, plan: null };
};
