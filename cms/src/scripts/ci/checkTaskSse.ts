import Redis from 'ioredis';

type FlightPlanCandidate = {
  id: number;
  slug: string;
};

type SseEvent = {
  event: string;
  id: string | null;
  data: string;
};

type AuthContext = {
  requestHeaderCandidates: Array<{
    label: string;
    headers: Record<string, string>;
  }>;
  profileSlug: string | null;
  mode: 'seed-captain' | 'anonymous';
};

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_REDIS_URL = 'redis://localhost:6379/0';
const READY_TIMEOUT_MS = Number.parseInt(process.env.CHECK_TASK_SSE_READY_TIMEOUT_MS ?? '', 10) || 15_000;
const EVENT_TIMEOUT_MS = Number.parseInt(process.env.CHECK_TASK_SSE_EVENT_TIMEOUT_MS ?? '', 10) || 10_000;

const log = (...args: any[]) => {
  console.log('[check-task-sse]', ...args);
};

const resolveBaseUrl = () =>
  (process.env.CMS_BASE_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

const resolveRedisUrl = () =>
  process.env.CMS_REDIS_URL ||
  process.env.REDIS_URL ||
  DEFAULT_REDIS_URL;

const resolveCaptainSeedEmail = (): string => {
  const explicit =
    process.env.CHECK_TASK_SSE_EMAIL ??
    process.env.CMS_SEED_CAPTAIN_EMAIL;
  if (typeof explicit === 'string' && explicit.trim().length) {
    return explicit.trim().toLowerCase();
  }
  const testcase = (process.env.CMS_SEED_TESTCASE ?? 'roles').trim().toLowerCase() || 'roles';
  return `test-${testcase}.captain@astralpirates.com`;
};

const resolveSeedPassword = (): string | null => {
  const value = process.env.SEED_DEFAULT_PASSWORD;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const mergeHeaders = (...sources: Array<Record<string, string> | null | undefined>): Record<string, string> => {
  const merged: Record<string, string> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }
  return merged;
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  let candidate = value.trim();
  if (!candidate.length) return null;
  candidate = candidate.replace(/^Bearer\s+/i, '').trim();
  candidate = candidate.replace(/^JWT\s+/i, '').trim();
  return candidate.length ? candidate : null;
};

const extractCookieHeader = (response: Response): string | null => {
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof responseHeaders.getSetCookie === 'function'
      ? responseHeaders.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie') as string]
        : [];
  const pairs = setCookies
    .map((entry) => entry.split(';', 1)[0]?.trim() ?? '')
    .filter((entry) => entry.length > 0 && entry.includes('='));
  if (!pairs.length) return null;
  return Array.from(new Set(pairs)).join('; ');
};

const parseViewer = (payload: any): { email: string | null; profileSlug: string | null } => {
  const user = payload?.user ?? payload?.doc ?? payload ?? null;
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : null;
  const profileSlug = typeof user?.profileSlug === 'string' && user.profileSlug.trim()
    ? user.profileSlug.trim()
    : null;
  return { email, profileSlug };
};

const loginSeedCaptain = async (baseUrl: string): Promise<AuthContext> => {
  const password = resolveSeedPassword();
  if (!password) {
    return {
      requestHeaderCandidates: [
        {
          label: 'anonymous',
          headers: {},
        },
      ],
      profileSlug: null,
      mode: 'anonymous',
    };
  }

  const email = resolveCaptainSeedEmail();
  const response = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Unable to authenticate seeded captain (${email}); login returned ${response.status}`);
  }

  const payload = await response.json();
  const viewer = parseViewer(payload);
  const token = normalizeToken(payload?.token);
  const cookieHeader = extractCookieHeader(response);
  const headerCandidates: Array<{ label: string; headers: Record<string, string> }> = [];
  if (token && cookieHeader) {
    headerCandidates.push({
      label: 'bearer+cookie',
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: cookieHeader,
      },
    });
  }
  if (token) {
    headerCandidates.push({
      label: 'bearer',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
  if (cookieHeader) {
    headerCandidates.push({
      label: 'cookie',
      headers: {
        Cookie: cookieHeader,
      },
    });
  }

  if (!headerCandidates.length) {
    throw new Error(`Seeded captain login for ${email} returned no usable auth token/cookie`);
  }

  return {
    requestHeaderCandidates: headerCandidates,
    profileSlug: viewer.profileSlug,
    mode: 'seed-captain',
  };
};

const getSnippet = (value: string, limit = 4000) => {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
};

const parseCandidates = (payload: any): FlightPlanCandidate[] => {
  const plans = Array.isArray(payload?.plans)
    ? payload.plans
    : Array.isArray(payload?.docs)
      ? payload.docs
      : [];
  const candidates: FlightPlanCandidate[] = [];
  for (const plan of plans) {
    const id = typeof plan?.id === 'number' ? plan.id : Number.parseInt(String(plan?.id ?? ''), 10);
    const slug = typeof plan?.slug === 'string' ? plan.slug : null;
    if (!Number.isFinite(id) || !slug || !slug.trim()) continue;
    candidates.push({ id, slug: slug.trim() });
  }
  return candidates;
};

const fetchPublicFlightPlans = async (
  baseUrl: string,
  requestHeaders: Record<string, string>,
  memberSlug: string | null = null,
): Promise<FlightPlanCandidate[]> => {
  const url = new URL('/api/flight-plans', baseUrl);
  url.searchParams.set('limit', '10');
  url.searchParams.set('depth', '0');
  if (memberSlug) {
    url.searchParams.set('memberSlug', memberSlug);
  }
  const response = await fetch(url.toString(), {
    headers: mergeHeaders(
      {
        Accept: 'application/json',
      },
      requestHeaders,
    ),
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch flight plans (${response.status}) from ${url.toString()}`);
  }
  const payload = await response.json();
  return parseCandidates(payload);
};

const resolveCandidates = async (
  baseUrl: string,
  auth: AuthContext,
): Promise<{
  candidates: FlightPlanCandidate[];
  probes: string[];
  selectedProbe: string;
  requestHeaders: Record<string, string>;
}> => {
  const attempts: Array<{
    label: string;
    requestHeaders: Record<string, string>;
    memberSlug: string | null;
  }> = [];

  for (const candidate of auth.requestHeaderCandidates) {
    attempts.push({
      label: candidate.label,
      requestHeaders: candidate.headers,
      memberSlug: null,
    });
    if (auth.profileSlug) {
      attempts.push({
        label: `${candidate.label}/member`,
        requestHeaders: candidate.headers,
        memberSlug: auth.profileSlug,
      });
    }
  }
  if (auth.mode === 'seed-captain') {
    attempts.push({
      label: 'anonymous-fallback',
      requestHeaders: {},
      memberSlug: null,
    });
  }

  const probes: string[] = [];
  let fallbackHeaders: Record<string, string> = {};
  let fallbackProbe = 'none';
  for (const attempt of attempts) {
    try {
      const candidates = await fetchPublicFlightPlans(baseUrl, attempt.requestHeaders, attempt.memberSlug);
      probes.push(`${attempt.label}=${candidates.length}`);
      fallbackHeaders = attempt.requestHeaders;
      fallbackProbe = attempt.label;
      if (candidates.length) {
        return {
          candidates,
          probes,
          selectedProbe: attempt.label,
          requestHeaders: attempt.requestHeaders,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /\((\d{3})\)/.exec(message)?.[1] ?? 'error';
      probes.push(`${attempt.label}=${status}`);
    }
  }

  return {
    candidates: [],
    probes,
    selectedProbe: fallbackProbe,
    requestHeaders: fallbackHeaders,
  };
};

const parseSseStream = async ({
  response,
  onEvent,
  onChunk,
  signal,
}: {
  response: Response;
  onEvent: (event: SseEvent) => void | Promise<void>;
  onChunk?: (chunk: { bytes: number; text: string }) => void;
  signal: AbortSignal;
}) => {
  if (!response.body) {
    throw new Error('SSE response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let eventId: string | null = null;
  let dataLines: string[] = [];

  const reset = () => {
    eventName = 'message';
    eventId = null;
    dataLines = [];
  };

  while (true) {
    if (signal.aborted) return;
    const { value, done } = await reader.read();
    if (done) return;
    const decoded = decoder.decode(value, { stream: true });
    onChunk?.({ bytes: value.length, text: decoded });
    buffer += decoded;

    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) break;
      const rawLine = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);

      const line = rawLine.replace(/\r$/, '');
      if (!line) {
        if (dataLines.length) {
          await onEvent({
            event: eventName,
            id: eventId,
            data: dataLines.join('\n'),
          });
        }
        reset();
        continue;
      }

      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event' && value) {
        eventName = value;
      } else if (field === 'id' && value) {
        eventId = value;
      } else if (field === 'data') {
        dataLines.push(value);
      }
    }
  }
};

const connectAndProbe = async ({
  baseUrl,
  redisUrl,
  candidate,
  requestHeaders,
}: {
  baseUrl: string;
  redisUrl: string;
  candidate: FlightPlanCandidate;
  requestHeaders: Record<string, string>;
}): Promise<void> => {
  const streamUrl = `${baseUrl}/api/flight-plans/${encodeURIComponent(candidate.slug)}/tasks/stream`;
  const controller = new AbortController();

  let readyReceived = false;
  const probeEventId = `ci-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const previewLimit = 4096;
  let bytesReceived = 0;
  let preview = '';
  let lastEventName: string | null = null;

  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = (error) => reject(error);
  });

  let resolveProbe: (() => void) | null = null;
  let rejectProbe: ((error: Error) => void) | null = null;
  const probePromise = new Promise<void>((resolve, reject) => {
    resolveProbe = resolve;
    rejectProbe = (error) => reject(error);
  });

  let readyTimer: NodeJS.Timeout | null = null;
  let probeTimer: NodeJS.Timeout | null = null;

  log(`connecting (slug=${candidate.slug}, flightPlanId=${candidate.id})`);

  const response = await fetch(streamUrl, {
    method: 'GET',
    headers: mergeHeaders(
      {
        Accept: 'text/event-stream',
      },
      requestHeaders,
    ),
    signal: controller.signal,
  });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    const body = await response.text().catch(() => '');
    controller.abort();
    throw new Error(
      `Stream rejected (${response.status}) from ${streamUrl}${body ? `; body=${JSON.stringify(getSnippet(body, 500))}` : ''}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    controller.abort();
    throw new Error(
      `Stream request failed (${response.status}) from ${streamUrl}${body ? `; body=${JSON.stringify(getSnippet(body, 500))}` : ''}`,
    );
  }

  log(
    `stream connected (status=${response.status}, content-type=${response.headers.get('content-type') ?? 'unknown'})`,
  );

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });
  await redis.connect();

  let resolvedFlightPlanId: number | null = null;
  let channel: string | null = null;
  let probePayload: string | null = null;

  const streamTask = parseSseStream({
    response,
    signal: controller.signal,
    onChunk: ({ bytes, text }) => {
      bytesReceived += bytes;
      if (preview.length < previewLimit) {
        preview = (preview + text).slice(0, previewLimit);
      }
    },
    onEvent: async (event) => {
      lastEventName = event.event;
      if (!readyReceived && event.event === 'ready') {
        try {
          const parsed = JSON.parse(event.data) as { flightPlanId?: unknown };
          const flightPlanId =
            typeof parsed.flightPlanId === 'number'
              ? parsed.flightPlanId
              : Number.parseInt(String(parsed.flightPlanId ?? ''), 10);
          if (!Number.isFinite(flightPlanId)) {
            throw new Error('Ready payload missing flightPlanId');
          }
          resolvedFlightPlanId = flightPlanId;
          channel = `flight-plan-tasks:${flightPlanId}`;
          probePayload = JSON.stringify({
            eventId: probeEventId,
            flightPlanId,
            taskId: 0,
            type: 'task-updated',
            happenedAt: new Date().toISOString(),
          });
        } catch (error) {
          rejectReady?.(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        readyReceived = true;
        if (readyTimer) clearTimeout(readyTimer);
        resolveReady?.();
        probeTimer = setTimeout(() => rejectProbe?.(new Error('SSE probe timeout')), EVENT_TIMEOUT_MS);
        if (!channel || !probePayload) {
          rejectProbe?.(new Error('Missing task channel after ready handshake'));
          return;
        }
        await redis.publish(channel, probePayload);
        return;
      }
      if (event.id === probeEventId) {
        if (probeTimer) clearTimeout(probeTimer);
        resolveProbe?.();
      }
    },
  });

  readyTimer = setTimeout(() => {
    const details = [
      `SSE ready timeout`,
      `slug=${candidate.slug}`,
      `flightPlanId=${candidate.id}`,
      resolvedFlightPlanId != null ? `resolvedFlightPlanId=${resolvedFlightPlanId}` : null,
      `bytesReceived=${bytesReceived}`,
      `lastEvent=${lastEventName ?? 'none'}`,
      preview ? `preview=${JSON.stringify(getSnippet(preview, 1200))}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    rejectReady?.(new Error(details));
  }, READY_TIMEOUT_MS);

  const streamError = streamTask
    .then(() => {
      const details = [
        'SSE stream ended',
        `slug=${candidate.slug}`,
        `flightPlanId=${candidate.id}`,
        resolvedFlightPlanId != null ? `resolvedFlightPlanId=${resolvedFlightPlanId}` : null,
        `bytesReceived=${bytesReceived}`,
        `lastEvent=${lastEventName ?? 'none'}`,
        preview ? `preview=${JSON.stringify(getSnippet(preview, 1200))}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      const error = new Error(details);
      if (!readyReceived) {
        rejectReady?.(error);
        return;
      }
      rejectProbe?.(error);
    })
    .catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!readyReceived) {
        rejectReady?.(err);
        return;
      }
      rejectProbe?.(err);
    });

  try {
    await readyPromise;
    await probePromise;
  } finally {
    controller.abort();
    if (readyTimer) clearTimeout(readyTimer);
    if (probeTimer) clearTimeout(probeTimer);
    await streamTask.catch(() => {});
    await streamError.catch(() => {});
    await redis.quit().catch(() => redis.disconnect());
  }
};

const main = async () => {
  const baseUrl = resolveBaseUrl();
  const redisUrl = resolveRedisUrl();
  const auth = await loginSeedCaptain(baseUrl);
  const { candidates, probes, selectedProbe, requestHeaders } = await resolveCandidates(baseUrl, auth);

  if (!candidates.length) {
    throw new Error(
      `No readable flight plans available at ${baseUrl}/api/flight-plans; seed content first or verify policy visibility. probes=${probes.join(',')}`,
    );
  }

  log(`baseUrl=${baseUrl}`);
  log(`redisUrl=${redisUrl}`);
  log(`auth=${auth.mode}${auth.profileSlug ? ` profileSlug=${auth.profileSlug}` : ''}`);
  log(`candidateProbes=${probes.join(',')}`);
  log(`selectedProbe=${selectedProbe}`);
  log(`candidates=${candidates.length}`);

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      await connectAndProbe({ baseUrl, redisUrl, candidate, requestHeaders });
      log(`ok (slug=${candidate.slug}, flightPlanId=${candidate.id})`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log(`failed (slug=${candidate.slug}, flightPlanId=${candidate.id})`, lastError.message);
      continue;
    }
  }

  throw lastError ?? new Error('Unable to validate task SSE stream');
};

main().catch((error) => {
  console.error('[check-task-sse] failed', error);
  process.exit(1);
});
