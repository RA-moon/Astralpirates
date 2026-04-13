import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { SeededAccount } from './fixtures';

const defaultApiBase = process.env.CI === 'true' ? 'http://cms:3000' : 'http://localhost:3000';
const DEFAULT_RETRY_ATTEMPTS = process.env.CI ? 4 : 2;
const DEFAULT_RETRY_BACKOFF_MS = process.env.CI ? 750 : 300;
const DEFAULT_REQUEST_TIMEOUT_MS = process.env.CI ? 30_000 : 15_000;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePositiveInt = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveRetryAttempts = (): number =>
  parsePositiveInt(process.env.PLAYWRIGHT_API_RETRY_ATTEMPTS) ?? DEFAULT_RETRY_ATTEMPTS;

const resolveRetryBackoffMs = (): number =>
  parsePositiveInt(process.env.PLAYWRIGHT_API_RETRY_BACKOFF_MS) ?? DEFAULT_RETRY_BACKOFF_MS;

const resolveRequestTimeoutMs = (): number =>
  parsePositiveInt(process.env.PLAYWRIGHT_API_TIMEOUT_MS) ?? DEFAULT_REQUEST_TIMEOUT_MS;

const parseRetryAfterMs = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1_000;
  }

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
};

const shouldRetry = (response: APIResponse): boolean =>
  TRANSIENT_HTTP_STATUSES.has(response.status());

const requestWithRetry = async (
  label: string,
  makeRequest: () => Promise<APIResponse>,
): Promise<APIResponse> => {
  const maxAttempts = resolveRetryAttempts();
  const baseBackoffMs = resolveRetryBackoffMs();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await makeRequest();
      if (!shouldRetry(response) || attempt === maxAttempts) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers()['retry-after']);
      const delayMs = retryAfterMs ?? baseBackoffMs * attempt;
      await sleep(delayMs);
      continue;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts) {
        throw lastError;
      }
      await sleep(baseBackoffMs * attempt);
    }
  }

  throw lastError ?? new Error(`${label} failed before receiving a response.`);
};

export const resolveApiBase = () =>
  process.env.PLAYWRIGHT_API_BASE ?? process.env.ASTRAL_API_BASE ?? defaultApiBase;

export const buildApiUrl = (path: string) => {
  const base = resolveApiBase();
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base.replace(/\/$/, '')}${path}`;
  }
};

type SessionResponse = {
  token: string | null;
  user?: {
    id?: number | string | null;
    profileSlug?: string | null;
    role?: string | null;
  } | null;
  exp?: string | null;
  expiresAt?: string | null;
};

export const loginViaApi = async (request: APIRequestContext, account: SeededAccount) => {
  const timeout = resolveRequestTimeoutMs();
  const response = await requestWithRetry(`login ${account.email}`, () =>
    request.post(buildApiUrl('/api/auth/login'), {
      data: { email: account.email, password: account.password },
      timeout,
    }),
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login failed for ${account.email} (${response.status()}): ${body}`);
  }
  const payload = (await response.json()) as SessionResponse;
  if (!payload?.token) {
    throw new Error(`Login response for ${account.email} missing token.`);
  }
  return payload;
};

export const refreshSessionViaApi = async (request: APIRequestContext, token: string) => {
  const timeout = resolveRequestTimeoutMs();
  const response = await requestWithRetry('session refresh', () =>
    request.get(buildApiUrl('/api/auth/session'), {
      headers: { Authorization: `Bearer ${token}` },
      timeout,
    }),
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Session refresh failed (${response.status()}): ${body}`);
  }
  return (await response.json()) as SessionResponse;
};

export const createFlightPlanViaApi = async (
  request: APIRequestContext,
  token: string,
  { title, summary, location }: { title: string; summary: string; location: string },
) => {
  const timeout = resolveRequestTimeoutMs();
  const response = await requestWithRetry('flight plan create', () =>
    request.post(buildApiUrl('/api/flight-plans'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title,
        summary,
        location,
        eventDate: new Date().toISOString().slice(0, 10),
        body: [
          {
            type: 'paragraph',
            children: [{ text: `Automated mission: ${summary}` }],
          },
        ],
      },
      timeout,
    }),
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to create flight plan (${response.status()}): ${body}`);
  }
  const payload = (await response.json()) as { plan?: { slug?: string | null; id?: number | null } };
  const slug = payload?.plan?.slug ?? null;
  if (!slug) {
    throw new Error('Created flight plan is missing slug.');
  }
  return slug;
};

export const inviteCrewToPlanViaApi = async (
  request: APIRequestContext,
  token: string,
  planSlug: string,
  crewSlug: string,
) => {
  const timeout = resolveRequestTimeoutMs();
  const response = await requestWithRetry('flight plan invite', () =>
    request.post(buildApiUrl(`/api/flight-plans/${encodeURIComponent(planSlug)}/members`), {
      headers: { Authorization: `Bearer ${token}` },
      data: { slug: crewSlug },
      timeout,
    }),
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Invite failed for ${crewSlug} on ${planSlug} (${response.status()}): ${body}`,
    );
  }
  const payload = (await response.json()) as { membership?: { id?: number | null } };
  const membershipId = payload?.membership?.id ?? null;
  if (membershipId == null) {
    throw new Error('Invite response missing membership id.');
  }
  return membershipId;
};
