const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT = 'astral-authz-telemetry-evidence';
const DENY_PREFIX = 'adminReadAllContent:deny:';
const ELEVATED_ALLOW_KEY = 'adminReadAllContent:allow:allow_admin_mode_enabled';
const HTTP_STATUS_UNAUTHORIZED = 401;

class InternalMetricsHttpError extends Error {
  constructor({ message, status }) {
    super(message);
    this.name = 'InternalMetricsHttpError';
    this.status = status;
  }
}

const withTimeout = async (requestFactory, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await requestFactory(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const safeJson = async (response) => {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

export const counterEntriesToMap = (entries) => {
  const next = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = typeof entry?.key === 'string' ? entry.key : '';
    const value = Number(entry?.value ?? 0);
    if (!key || !Number.isFinite(value)) continue;
    next.set(key, value);
  }
  return next;
};

export const diffCounterMaps = (beforeMap, afterMap) => {
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  return Array.from(keys)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const before = beforeMap.get(key) ?? 0;
      const after = afterMap.get(key) ?? 0;
      return {
        key,
        before,
        after,
        delta: after - before,
      };
    });
};

export const sumDeltaByPrefix = (deltas, prefix) =>
  deltas
    .filter((entry) => entry.key.startsWith(prefix))
    .reduce((total, entry) => total + entry.delta, 0);

const extractTelemetry = (payload) => {
  const authz = payload?.protections?.authorizationDecisions;
  if (!authz || typeof authz !== 'object') {
    throw new Error('Internal metrics payload missing protections.authorizationDecisions.');
  }
  return {
    observedEvents: Number(authz.observedEvents ?? 0),
    allowEvents: Number(authz.allowEvents ?? 0),
    denyEvents: Number(authz.denyEvents ?? 0),
    elevatedAllowEvents: Number(authz.elevatedAllowEvents ?? 0),
    counters: counterEntriesToMap(authz.counters),
  };
};

const assertInternalMetricsResponse = async (response, label) => {
  const payload = await safeJson(response);
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object'
        ? payload.error ?? payload.message ?? JSON.stringify(payload)
        : '';
    throw new InternalMetricsHttpError({
      message: `${label} failed (${response.status})${detail ? `: ${detail}` : ''}`,
      status: response.status,
    });
  }
  if (!payload || payload.ok !== true) {
    throw new Error(`${label} returned an invalid metrics payload.`);
  }
  if (payload.accessClass !== 'internal') {
    throw new Error(`${label} must return accessClass=internal.`);
  }
  return payload;
};

const resolveBearerToken = async ({
  baseUrl,
  token,
  email,
  password,
  timeoutMs,
  userAgent,
  fetchImpl,
}) => {
  if (typeof token === 'string' && token.trim()) {
    return {
      token: token.trim(),
      source: 'provided',
    };
  }

  if (!String(email || '').trim() || !String(password || '').trim()) {
    throw new Error('Provide --token or --email/--password for authenticated internal metrics access.');
  }

  const loginUrl = new URL('/api/auth/login', baseUrl).toString();
  const response = await withTimeout(
    (signal) =>
      fetchImpl(loginUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': userAgent,
        },
        body: JSON.stringify({
          email,
          password,
        }),
        signal,
      }),
    timeoutMs,
  );
  const payload = await safeJson(response);

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object'
        ? payload.error ?? payload.message ?? JSON.stringify(payload)
        : '';
    throw new Error(`Auth login failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const resolved =
    payload && typeof payload === 'object' && typeof payload.token === 'string'
      ? payload.token.trim()
      : '';
  if (!resolved) {
    throw new Error('Auth login succeeded but did not return a token.');
  }
  return {
    token: resolved,
    source: 'login',
  };
};

const canRetryWithLogin = ({ tokenSource, email, password }) =>
  tokenSource === 'provided' && String(email || '').trim() && String(password || '').trim();

const fetchInternalMetrics = async ({
  metricsUrl,
  timeoutMs,
  userAgent,
  fetchImpl,
  token,
  adminViewEnabled,
  adminEditEnabled,
  label,
}) => {
  const response = await withTimeout(
    (signal) =>
      fetchImpl(metricsUrl, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'user-agent': userAgent,
          'x-admin-view-enabled': adminViewEnabled ? 'true' : 'false',
          'x-admin-edit-enabled': adminEditEnabled ? 'true' : 'false',
        },
        signal,
      }),
    timeoutMs,
  );

  return assertInternalMetricsResponse(response, label);
};

const triggerUnauthenticatedDeniedProbe = async ({
  metricsUrl,
  timeoutMs,
  userAgent,
  fetchImpl,
}) => {
  const response = await withTimeout(
    (signal) =>
      fetchImpl(metricsUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': userAgent,
          'x-admin-view-enabled': 'true',
          'x-admin-edit-enabled': 'false',
        },
        signal,
      }),
    timeoutMs,
  );
  const payload = await safeJson(response);

  if (response.status !== 401) {
    const detail =
      payload && typeof payload === 'object'
        ? payload.error ?? payload.message ?? JSON.stringify(payload)
        : '';
    throw new Error(
      `Unauthenticated deny probe must return 401, received ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  return {
    status: response.status,
    payload,
  };
};

export const runAuthzTelemetryEvidenceCheck = async ({
  baseUrl,
  metricsPath = '/api/ship-status/metrics',
  internalScope = 'internal',
  token = '',
  email = '',
  password = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  userAgent = DEFAULT_USER_AGENT,
}) => {
  const base = new URL(baseUrl).toString();
  const metricsUrl = new URL(metricsPath, base);
  metricsUrl.searchParams.set('scope', internalScope);
  const scopedMetricsUrl = metricsUrl.toString();

  let tokenResolution = await resolveBearerToken({
    baseUrl: base,
    token,
    email,
    password,
    timeoutMs,
    userAgent,
    fetchImpl,
  });
  let bearerToken = tokenResolution.token;

  let beforePayload;
  try {
    beforePayload = await fetchInternalMetrics({
      metricsUrl: scopedMetricsUrl,
      timeoutMs,
      userAgent,
      fetchImpl,
      token: bearerToken,
      adminViewEnabled: false,
      adminEditEnabled: false,
      label: 'Baseline internal metrics fetch',
    });
  } catch (error) {
    if (
      error instanceof InternalMetricsHttpError &&
      error.status === HTTP_STATUS_UNAUTHORIZED &&
      canRetryWithLogin({
        tokenSource: tokenResolution.source,
        email,
        password,
      })
    ) {
      tokenResolution = await resolveBearerToken({
        baseUrl: base,
        token: '',
        email,
        password,
        timeoutMs,
        userAgent,
        fetchImpl,
      });
      bearerToken = tokenResolution.token;
      beforePayload = await fetchInternalMetrics({
        metricsUrl: scopedMetricsUrl,
        timeoutMs,
        userAgent,
        fetchImpl,
        token: bearerToken,
        adminViewEnabled: false,
        adminEditEnabled: false,
        label: 'Baseline internal metrics fetch',
      });
    } else {
      throw error;
    }
  }

  const denyProbe = await triggerUnauthenticatedDeniedProbe({
    metricsUrl: scopedMetricsUrl,
    timeoutMs,
    userAgent,
    fetchImpl,
  });

  await fetchInternalMetrics({
    metricsUrl: scopedMetricsUrl,
    timeoutMs,
    userAgent,
    fetchImpl,
    token: bearerToken,
    adminViewEnabled: true,
    adminEditEnabled: false,
    label: 'Elevated allow probe',
  });

  const afterPayload = await fetchInternalMetrics({
    metricsUrl: scopedMetricsUrl,
    timeoutMs,
    userAgent,
    fetchImpl,
    token: bearerToken,
    adminViewEnabled: false,
    adminEditEnabled: false,
    label: 'Post-probe internal metrics fetch',
  });

  const beforeTelemetry = extractTelemetry(beforePayload);
  const afterTelemetry = extractTelemetry(afterPayload);
  const counterDeltas = diffCounterMaps(beforeTelemetry.counters, afterTelemetry.counters);

  const deniedReasonDelta = sumDeltaByPrefix(counterDeltas, DENY_PREFIX);
  const elevatedAllowReasonDelta = counterDeltas.find((entry) => entry.key === ELEVATED_ALLOW_KEY)?.delta ?? 0;

  const denyEventsDelta = afterTelemetry.denyEvents - beforeTelemetry.denyEvents;
  const elevatedAllowEventsDelta = afterTelemetry.elevatedAllowEvents - beforeTelemetry.elevatedAllowEvents;

  if (denyEventsDelta < 1 || deniedReasonDelta < 1) {
    throw new Error(
      `Denied telemetry evidence missing (denyEventsDelta=${denyEventsDelta}, deniedReasonDelta=${deniedReasonDelta}).`,
    );
  }
  if (elevatedAllowEventsDelta < 1 || elevatedAllowReasonDelta < 1) {
    throw new Error(
      `Elevated allow telemetry evidence missing (elevatedAllowEventsDelta=${elevatedAllowEventsDelta}, elevatedAllowReasonDelta=${elevatedAllowReasonDelta}).`,
    );
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: base,
      metricsUrl: scopedMetricsUrl,
      metricsPath,
      internalScope,
    },
    probes: {
      deniedUnauthenticatedInternal: {
        expectedStatus: 401,
        status: denyProbe.status,
      },
      elevatedAuthenticatedInternal: {
        expectedStatus: 200,
        status: 200,
      },
    },
    telemetry: {
      before: {
        observedEvents: beforeTelemetry.observedEvents,
        allowEvents: beforeTelemetry.allowEvents,
        denyEvents: beforeTelemetry.denyEvents,
        elevatedAllowEvents: beforeTelemetry.elevatedAllowEvents,
      },
      after: {
        observedEvents: afterTelemetry.observedEvents,
        allowEvents: afterTelemetry.allowEvents,
        denyEvents: afterTelemetry.denyEvents,
        elevatedAllowEvents: afterTelemetry.elevatedAllowEvents,
      },
      deltas: {
        denyEvents: denyEventsDelta,
        elevatedAllowEvents: elevatedAllowEventsDelta,
        deniedReasonDelta,
        elevatedAllowReasonDelta,
      },
      counterDeltas: counterDeltas.filter((entry) => entry.delta !== 0),
    },
  };
};
