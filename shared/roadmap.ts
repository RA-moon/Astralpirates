import {
  RoadmapResponseSchema,
  RoadmapTiersCmsResponseSchema,
  type RoadmapCmsResponse,
  type RoadmapItem,
  type RoadmapPlan,
  type RoadmapResponse,
  type RoadmapTier,
} from './api-contracts';
import { normalizeAccessPolicy } from './accessPolicy';

export type FetchRoadmapOptions = {
  baseUrl?: string | null;
  limit?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onError?: (error: Error, context: { endpoint: string }) => void;
};

const DEFAULT_LIMIT = 50;

const trimTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
};

const sanitizeBaseUrl = (baseUrl: string) => trimTrailingSlashes(baseUrl);

export const buildRoadmapCmsEndpoint = (baseUrl: string, limit: number = DEFAULT_LIMIT) => {
  const trimmed = sanitizeBaseUrl(baseUrl);
  const params = new URLSearchParams({
    limit: String(limit),
    depth: '1',
    sort: 'tierId',
  });
  return `${trimmed}/api/roadmap-tiers?${params.toString()}`;
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const statusSet = new Set(['queued', 'active', 'shipped', 'tested', 'canceled']);
const cloudStatusSet = new Set(['pending', 'deploying', 'healthy']);

const normaliseStatus = (value: unknown, fallback: string, allowed: Set<string>) => {
  const candidate = nullableString(value);
  if (!candidate) return fallback;
  const lower = candidate.toLowerCase();
  return allowed.has(lower) ? lower : fallback;
};

const normalisePlan = (plan: RoadmapCmsResponse['docs'][number]['items'][number]['plan']): RoadmapPlan | null => {
  if (!plan) return null;
  const title = nullableString(plan.title);
  const owner = nullableString(plan.owner);
  const path = nullableString(plan.path);
  const status = normaliseStatus(plan.status, 'queued', statusSet);
  const cloudStatus = normaliseStatus(plan.cloudStatus, 'pending', cloudStatusSet);
  if (!title && !owner && !path && !plan.id) return null;
  return {
    id: nullableString(plan.id),
    title: title ?? 'Plan',
    owner,
    path,
    status,
    cloudStatus,
  };
};

const normaliseItem = (item: RoadmapCmsResponse['docs'][number]['items'][number]): RoadmapItem | null => {
  const title = nullableString(item.title);
  if (!title) return null;
  const code = nullableString(item.code) ?? title;

  return {
    id: code,
    code,
    title,
    summary: nullableString(item.summary),
    accessPolicy: normalizeAccessPolicy((item as any).accessPolicy),
    status: normaliseStatus(item.status, 'queued', statusSet),
    cloudStatus: normaliseStatus(item.cloudStatus, 'pending', cloudStatusSet),
    referenceLabel: nullableString(item.referenceLabel),
    referenceUrl: nullableString(item.referenceUrl),
    plan: normalisePlan(item.plan),
  };
};

const normaliseTier = (tier: RoadmapCmsResponse['docs'][number]): RoadmapTier => {
  const tierId =
    nullableString(tier.tierId) ??
    nullableString(tier.tier) ??
    (typeof tier.id === 'string' ? tier.id : String(tier.id));
  const items = (tier.items ?? []).map(normaliseItem).filter(Boolean) as RoadmapItem[];
  const filteredItems = items.filter((item) => item.status !== 'tested' && item.status !== 'canceled');

  return {
    id: tierId ?? 'tier',
    tier: nullableString(tier.tier) ?? tierId ?? 'tier',
    title: tier.title || tierId || 'Tier',
    description: nullableString(tier.description),
    accessPolicy: normalizeAccessPolicy((tier as any).accessPolicy),
    focus: nullableString(tier.focus),
    statusSummary: nullableString(tier.statusSummary),
    items: filteredItems,
  };
};

const normaliseCmsResponse = (payload: RoadmapCmsResponse): RoadmapResponse => {
  const tiers = (payload.docs ?? []).map(normaliseTier);
  const parsed = RoadmapResponseSchema.safeParse({
    generatedAt: new Date().toISOString(),
    tiers,
  });
  if (parsed.success) return parsed.data;
  return { generatedAt: null, tiers: [] };
};

export const normalizeRoadmapCmsResponse = (payload: RoadmapCmsResponse): RoadmapResponse =>
  normaliseCmsResponse(payload);

export const fetchRoadmapFromCms = async (
  options: FetchRoadmapOptions = {},
): Promise<RoadmapResponse | null> => {
  const { baseUrl, limit = DEFAULT_LIMIT, signal, fetchImpl = globalThis.fetch, onError } = options;
  if (!baseUrl || typeof fetchImpl !== 'function') {
    return null;
  }

  const endpoint = buildRoadmapCmsEndpoint(baseUrl, limit);
  try {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const parsed = RoadmapTiersCmsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`[roadmap] Invalid CMS response (${endpoint}): ${parsed.error.message}`);
    }

    return normaliseCmsResponse(parsed.data);
  } catch (error: any) {
    if (typeof onError === 'function') {
      onError(error instanceof Error ? error : new Error(String(error)), { endpoint });
    }
    return null;
  }
};
