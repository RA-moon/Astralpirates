type AuthProtectionScope = 'invites' | 'password_resets';
type AuthProtectionEvent = 'redis_unavailable' | 'degraded_allow' | 'degraded_block';
type AuthProtectionMode = 'fail_closed' | 'emergency';

type AuthProtectionTelemetryRecord = {
  scope: AuthProtectionScope;
  event: AuthProtectionEvent;
  mode: AuthProtectionMode;
  error?: unknown;
};

const telemetryCounters = new Map<string, number>();
let observedEvents = 0;
let lastEventAt: string | null = null;

const bumpCounter = (key: string) => {
  const current = telemetryCounters.get(key) ?? 0;
  telemetryCounters.set(key, current + 1);
};

const resolveSummaryEvery = (): number => {
  const parsed = Number.parseInt(process.env.AUTH_PROTECTION_TELEMETRY_SUMMARY_EVERY ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return parsed;
};

export const recordAuthProtectionTelemetry = (record: AuthProtectionTelemetryRecord): void => {
  const key = `${record.scope}:${record.event}:${record.mode}`;
  bumpCounter(key);
  observedEvents += 1;
  lastEventAt = new Date().toISOString();

  const payload = {
    event: 'auth_protection_degraded',
    scope: record.scope,
    degradedEvent: record.event,
    mode: record.mode,
    ...(record.error ? { error: record.error } : {}),
    observedEvents,
    key,
  };

  if (record.event === 'degraded_allow') {
    console.warn('[auth-protection] emergency limiter path in use', payload);
  } else {
    console.error('[auth-protection] auth protection degraded', payload);
  }

  const summaryEvery = resolveSummaryEvery();
  if (observedEvents % summaryEvery !== 0) return;

  console.warn('[auth-protection] degraded-state counters summary', {
    event: 'auth_protection_degraded_summary',
    observedEvents,
    counters: Array.from(telemetryCounters.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([counterKey, value]) => ({ key: counterKey, value })),
    lastEventAt,
  });
};

export const getAuthProtectionTelemetrySnapshot = () => ({
  observedEvents,
  lastEventAt,
  counters: Array.from(telemetryCounters.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value })),
});

export const resetAuthProtectionTelemetry = () => {
  telemetryCounters.clear();
  observedEvents = 0;
  lastEventAt = null;
};
