import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';

import { corsEmpty, corsJson } from '../_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_HEADER = 'public, max-age=0, s-maxage=30, stale-while-revalidate=30';
const CACHE_MAX_AGE_MS = 30 * 1000;

const BACKUP_ROOT = '/opt/backups';
const BACKUP_STATUS_PATH = `${BACKUP_ROOT}/status.json`;
const DEPLOY_LOG_PATH = '/opt/shared/deploy-log.md';
const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

type ComponentState = 'healthy' | 'degraded' | 'unknown';

type StatusComponent = {
  id: 'cms' | 'backups' | 'deploy';
  label: string;
  state: ComponentState;
  summary: string;
  checkedAt: string;
  details: Record<string, string | number | boolean | null>;
};

type StatusPayload = {
  ok: boolean;
  state: ComponentState;
  generatedAt: string;
  components: StatusComponent[];
};

type FetchResult = {
  ok: boolean;
  status: number | null;
  payload: any;
  error: string | null;
};

type StatusLogger = {
  warn?: (...args: any[]) => void;
};

type CacheEntry = {
  payload: StatusPayload;
  generatedAtMs: number;
};

let cached: CacheEntry | null = null;

const toIso = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
};

const minutesSince = (value: string, nowMs: number): number | null => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 60_000));
};

const safeReadJsonFile = async (path: string): Promise<any | null> => {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const logWarn = (logger: StatusLogger | null | undefined, payload: Record<string, unknown>, message: string) => {
  if (typeof logger?.warn === 'function') {
    logger.warn(payload, message);
    return;
  }
  console.warn(message, payload);
};

const fetchJson = async (url: string): Promise<FetchResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'user-agent': 'astral-status-route',
      },
      cache: 'no-store',
    });

    const payload = await response.json().catch(async () => {
      const text = await response.text().catch(() => '');
      return text || null;
    });

    return {
      ok: response.ok,
      status: response.status,
      payload,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveProbeBaseUrl = (req: NextRequest): string | null => {
  const candidates = [
    process.env.STATUS_PROBE_BASE_URL,
    process.env.INTERNAL_API_BASE,
    req.nextUrl?.origin,
    process.env.ASTRAL_API_BASE,
    process.env.NUXT_PUBLIC_ASTRAL_API_BASE,
    process.env.PAYLOAD_PUBLIC_SERVER_URL,
    process.env.PAYLOAD_PUBLIC_SITE_URL,
    process.env.PAYLOAD_PUBLIC_FRONTEND_URL,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      continue;
    }
  }

  return null;
};

const queryCollectionHealth = async ({
  payload,
  collection,
  logger,
  errorMessage,
}: {
  payload: Awaited<ReturnType<typeof getPayloadInstance>> | null;
  collection: 'pages' | 'users';
  logger: StatusLogger | null | undefined;
  errorMessage: string;
}): Promise<boolean | null> => {
  if (!payload) return null;
  try {
    await payload.find({
      collection,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    return true;
  } catch (error) {
    logWarn(
      logger,
      {
        err: error instanceof Error ? error.message : String(error),
        collection,
      },
      errorMessage,
    );
    return false;
  }
};

const resolveCmsComponent = async (
  checkedAt: string,
  baseUrl: string | null,
  logger: StatusLogger | null | undefined,
  payload: Awaited<ReturnType<typeof getPayloadInstance>> | null,
): Promise<StatusComponent> => {
  let pagesHealthy = await queryCollectionHealth({
    payload,
    collection: 'pages',
    logger,
    errorMessage: '[status] Local pages health query failed.',
  });
  let profilesHealthy = await queryCollectionHealth({
    payload,
    collection: 'users',
    logger,
    errorMessage: '[status] Local profiles health query failed.',
  });

  if (baseUrl && pagesHealthy === null) {
    const pagesProbe = await fetchJson(new URL('/api/pages/health', baseUrl).toString());
    pagesHealthy = pagesProbe.ok && pagesProbe.payload?.ok === true;
  }

  if (baseUrl && profilesHealthy === null) {
    const profilesProbe = await fetchJson(new URL('/api/profiles/health', baseUrl).toString());
    profilesHealthy = profilesProbe.ok && profilesProbe.payload?.ok === true;
  }

  const metrics =
    baseUrl != null
      ? await fetchJson(new URL('/api/ship-status/metrics', baseUrl).toString())
      : {
          ok: false,
          status: null,
          payload: null,
          error: null,
        };
  const metricsGeneratedAt = baseUrl ? toIso(metrics.payload?.generatedAt) ?? null : null;

  if (pagesHealthy && profilesHealthy) {
    return {
      id: 'cms',
      label: 'CMS health',
      state: 'healthy',
      summary: 'Pages and profiles health probes are passing.',
      checkedAt,
      details: {
        pagesHealth: true,
        profilesHealth: true,
        metricsGeneratedAt,
      },
    };
  }

  if (pagesHealthy === null && profilesHealthy === null) {
    return {
      id: 'cms',
      label: 'CMS health',
      state: 'unknown',
      summary: 'CMS health probes are unavailable.',
      checkedAt,
      details: {
        pagesHealth: null,
        profilesHealth: null,
        metricsGeneratedAt,
      },
    };
  }

  logWarn(
    logger,
    {
      pagesHealth: pagesHealthy,
      profilesHealth: profilesHealthy,
      metricsStatus: metrics.status,
      metricsError: metrics.error,
    },
    '[status] One or more CMS probes are failing.',
  );

  return {
    id: 'cms',
    label: 'CMS health',
    state: 'degraded',
    summary: 'One or more CMS health probes failed.',
    checkedAt,
    details: {
      pagesHealth: pagesHealthy,
      profilesHealth: profilesHealthy,
      metricsGeneratedAt,
    },
  };
};

const findLatestBackupManifest = async (): Promise<{ filename: string; payload: any } | null> => {
  let entries: string[] = [];
  try {
    entries = await readdir(BACKUP_ROOT);
  } catch {
    return null;
  }

  const latest = entries
    .filter((entry) => /^backup-manifest-\d{8}T\d{6}Z\.json$/i.test(entry))
    .sort()
    .at(-1);

  if (!latest) return null;
  const payload = await safeReadJsonFile(join(BACKUP_ROOT, latest));
  if (!payload) return null;
  return { filename: latest, payload };
};

const resolveBackupsComponent = async (checkedAt: string, nowMs: number): Promise<StatusComponent> => {
  const statusPayload = await safeReadJsonFile(BACKUP_STATUS_PATH);
  let source: 'status-json' | 'manifest' | 'none' = 'none';
  let okFromSource: boolean | null = null;
  let lastRun: string | null = null;
  let manifestName: string | null = null;

  if (statusPayload && typeof statusPayload === 'object') {
    source = 'status-json';
    okFromSource = typeof statusPayload.ok === 'boolean' ? statusPayload.ok : null;
    lastRun = toIso(statusPayload.lastRun) ?? null;
  }

  if (!lastRun || source === 'none') {
    const manifest = await findLatestBackupManifest();
    if (manifest) {
      if (source === 'none') source = 'manifest';
      if (!lastRun) {
        lastRun = toIso(manifest.payload?.generatedAt) ?? null;
      }
      manifestName = manifest.filename;
    }
  }

  if (!lastRun) {
    return {
      id: 'backups',
      label: 'Backups',
      state: 'unknown',
      summary: 'No backup status artifact is available on this host.',
      checkedAt,
      details: {
        source,
        lastRun: null,
        ageMinutes: null,
        manifest: manifestName,
      },
    };
  }

  const ageMinutes = minutesSince(lastRun, nowMs);
  const stale = ageMinutes === null ? true : ageMinutes * 60_000 > BACKUP_STALE_MS;
  const explicitFailure = okFromSource === false;
  const healthy = !stale && !explicitFailure;

  return {
    id: 'backups',
    label: 'Backups',
    state: healthy ? 'healthy' : 'degraded',
    summary: healthy
      ? 'Latest backup signal is fresh.'
      : explicitFailure
        ? 'Backup status reports a failure.'
        : 'Latest backup signal is stale.',
    checkedAt,
    details: {
      source,
      lastRun,
      ageMinutes,
      manifest: manifestName,
    },
  };
};

const parseDeployEntry = (line: string): { deployedAt: string | null; deploymentId: string | null; sha: string | null } => {
  const trimmed = line.trim();
  const match = trimmed.match(
    /^\*\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+UTC)\s+—\s+(.+?)\s+\(([0-9a-f]{7,40})\)/i,
  );
  if (!match) {
    return { deployedAt: null, deploymentId: null, sha: null };
  }

  const deployedAtRaw = match[1];
  const deploymentIdRaw = match[2];
  const shaRaw = match[3];
  if (!deployedAtRaw || !deploymentIdRaw || !shaRaw) {
    return { deployedAt: null, deploymentId: null, sha: null };
  }

  const deployedAt = toIso(deployedAtRaw.replace(' UTC', 'Z').replace(' ', 'T'));
  const deploymentId = deploymentIdRaw.trim() || null;
  const sha = shaRaw.toLowerCase() || null;
  return { deployedAt, deploymentId, sha };
};

const resolveDeployComponent = async (checkedAt: string): Promise<StatusComponent> => {
  let raw = '';
  try {
    raw = await readFile(DEPLOY_LOG_PATH, 'utf8');
  } catch {
    return {
      id: 'deploy',
      label: 'Deploy log',
      state: 'unknown',
      summary: 'No deploy audit log was found on this host.',
      checkedAt,
      details: {
        deployedAt: null,
        deploymentId: null,
        sha: null,
      },
    };
  }

  const lastLine =
    raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? '';
  const parsed = parseDeployEntry(lastLine);

  if (!parsed.sha || !parsed.deployedAt) {
    return {
      id: 'deploy',
      label: 'Deploy log',
      state: 'unknown',
      summary: 'Deploy audit log exists but latest entry is not parseable.',
      checkedAt,
      details: {
        deployedAt: null,
        deploymentId: null,
        sha: null,
      },
    };
  }

  return {
    id: 'deploy',
    label: 'Deploy log',
    state: 'healthy',
    summary: `Latest deploy recorded at ${parsed.deployedAt}.`,
    checkedAt,
    details: {
      deployedAt: parsed.deployedAt,
      deploymentId: parsed.deploymentId,
      sha: parsed.sha.slice(0, 12),
    },
  };
};

const resolveOverallState = (components: StatusComponent[]): ComponentState => {
  if (components.some((component) => component.state === 'degraded')) return 'degraded';
  if (components.every((component) => component.state === 'healthy')) return 'healthy';
  return 'unknown';
};

const withCacheHeaders = <T extends Response>(response: T): T => {
  response.headers.set('Cache-Control', CACHE_HEADER);
  return response;
};

export async function GET(req: NextRequest) {
  const nowMs = Date.now();
  if (cached && nowMs - cached.generatedAtMs < CACHE_MAX_AGE_MS) {
    return withCacheHeaders(corsJson(req, cached.payload, { status: 200 }, 'OPTIONS,GET'));
  }

  const payload = await getPayloadInstance().catch(() => null);
  const logger = payload?.logger;
  const generatedAt = new Date(nowMs).toISOString();
  const baseUrl = resolveProbeBaseUrl(req);

  const components = await Promise.all([
    resolveCmsComponent(generatedAt, baseUrl, logger, payload),
    resolveBackupsComponent(generatedAt, nowMs),
    resolveDeployComponent(generatedAt),
  ]);

  const state = resolveOverallState(components);
  const snapshot: StatusPayload = {
    ok: state === 'healthy',
    state,
    generatedAt,
    components,
  };
  cached = { payload: snapshot, generatedAtMs: nowMs };

  return withCacheHeaders(corsJson(req, snapshot, { status: 200 }, 'OPTIONS,GET'));
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 'OPTIONS,GET');
}
