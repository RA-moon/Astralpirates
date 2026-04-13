import { request, type APIRequestContext, type FullConfig } from '@playwright/test';

import { buildApiUrl, loginViaApi } from './api';
import { getSeededCaptain, getSeededCrew } from './fixtures';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const WARMUP_TIMEOUT_MS = 120_000;
const WARMUP_ATTEMPTS = 3;

const warmEndpoint = async (
  context: APIRequestContext,
  path: string,
  options: { headers?: Record<string, string> } = {},
): Promise<void> => {
  const url = buildApiUrl(path);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt += 1) {
    try {
      const response = await context.get(url, {
        headers: options.headers,
        timeout: WARMUP_TIMEOUT_MS,
      });
      if (response.ok()) return;
      lastError = new Error(`Warm-up failed for ${path} (status ${response.status()}).`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await sleep(1_000 * attempt);
  }

  if (lastError) {
    throw lastError;
  }
};

const warmPayload = async (context: APIRequestContext): Promise<void> => {
  const attempts = 5;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await context.get(buildApiUrl('/api/pages/health'), { timeout: 60_000 });
      if (response.ok()) return;
    } catch {
      // ignore and retry
    }

    await sleep(1_000 * attempt);
  }

  throw new Error('CMS did not become ready for Payload requests (/api/pages/health).');
};

const warmAuthenticatedRoutes = async (context: APIRequestContext): Promise<void> => {
  let captain = null;
  let crew = null;
  try {
    captain = getSeededCaptain();
  } catch {
    captain = null;
  }
  try {
    crew = getSeededCrew();
  } catch {
    crew = null;
  }
  if (!captain && !crew) {
    return;
  }

  let captainSession = null;
  let crewSession = null;
  try {
    captainSession = captain ? await loginViaApi(context, captain) : null;
    crewSession = crew ? await loginViaApi(context, crew) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[playwright-global-setup] authenticated route warm-up skipped: ${message}\n`,
    );
    return;
  }
  const captainHeaders = captainSession?.token
    ? { Authorization: `Bearer ${captainSession.token}` }
    : null;
  const crewHeaders = crewSession?.token ? { Authorization: `Bearer ${crewSession.token}` } : null;

  if (captain && captainHeaders) {
    await warmEndpoint(context, `/api/profiles/${encodeURIComponent(captain.slug)}`, {
      headers: captainHeaders,
    });
    await warmEndpoint(context, '/api/profiles/me', { headers: captainHeaders });
    await warmEndpoint(context, '/api/logs?minRole=captain&limit=10', {
      headers: captainHeaders,
    });
  }

  if (crew && crewHeaders) {
    await warmEndpoint(context, `/api/profiles/${encodeURIComponent(crew.slug)}`, {
      headers: crewHeaders,
    });
    await warmEndpoint(context, '/api/flight-plans/invitations', { headers: crewHeaders });
    await warmEndpoint(
      context,
      `/api/flight-plans?memberSlug=${encodeURIComponent(crew.slug)}&limit=5`,
      { headers: crewHeaders },
    );
  }
};

const warmRoutes = async (context: APIRequestContext): Promise<void> => {
  await warmEndpoint(context, '/api/profiles/health');
  await warmAuthenticatedRoutes(context);
};

export default async function globalSetup(_: FullConfig) {
  const context = await request.newContext();
  try {
    await warmPayload(context);
    await warmRoutes(context);
  } finally {
    await context.dispose();
  }
}
