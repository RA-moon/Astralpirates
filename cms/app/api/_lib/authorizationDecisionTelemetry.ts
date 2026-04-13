type PayloadLike = {
  logger?: {
    info?: (meta: Record<string, unknown>, message: string) => void;
    warn?: (meta: Record<string, unknown>, message: string) => void;
  };
} | null | undefined;

const ELEVATED_CAPABILITIES = new Set(['adminReadAllContent', 'adminEditAllContent']);

const telemetryCounters = new Map<string, number>();
let observedEvents = 0;
let allowEvents = 0;
let denyEvents = 0;
let elevatedAllowEvents = 0;
let elevatedReadAllowEvents = 0;
let elevatedEditAllowEvents = 0;
let adminCapabilityDenyEvents = 0;
let lastEventAt: string | null = null;

type AuthorizationDecisionAlertThresholds = {
  elevatedReadAllowEvents: number;
  elevatedEditAllowEvents: number;
  adminCapabilityDenyEvents: number;
};

type AuthorizationDecisionAlert = {
  key: keyof AuthorizationDecisionAlertThresholds;
  observed: number;
  threshold: number;
};

const DEFAULT_ALERT_THRESHOLDS: AuthorizationDecisionAlertThresholds = Object.freeze({
  elevatedReadAllowEvents: 20,
  elevatedEditAllowEvents: 10,
  adminCapabilityDenyEvents: 30,
});

const bumpCounter = (key: string): void => {
  const current = telemetryCounters.get(key) ?? 0;
  telemetryCounters.set(key, current + 1);
};

const parseThresholdEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveAlertThresholds = (): AuthorizationDecisionAlertThresholds => ({
  elevatedReadAllowEvents: parseThresholdEnv(
    process.env.AUTHZ_ALERT_ELEVATED_READ_ALLOW_THRESHOLD,
    DEFAULT_ALERT_THRESHOLDS.elevatedReadAllowEvents,
  ),
  elevatedEditAllowEvents: parseThresholdEnv(
    process.env.AUTHZ_ALERT_ELEVATED_EDIT_ALLOW_THRESHOLD,
    DEFAULT_ALERT_THRESHOLDS.elevatedEditAllowEvents,
  ),
  adminCapabilityDenyEvents: parseThresholdEnv(
    process.env.AUTHZ_ALERT_ADMIN_DENY_THRESHOLD,
    DEFAULT_ALERT_THRESHOLDS.adminCapabilityDenyEvents,
  ),
});

const buildTriggeredAlerts = (
  thresholds: AuthorizationDecisionAlertThresholds,
): AuthorizationDecisionAlert[] => {
  const alerts: AuthorizationDecisionAlert[] = [
    {
      key: 'elevatedReadAllowEvents',
      observed: elevatedReadAllowEvents,
      threshold: thresholds.elevatedReadAllowEvents,
    },
    {
      key: 'elevatedEditAllowEvents',
      observed: elevatedEditAllowEvents,
      threshold: thresholds.elevatedEditAllowEvents,
    },
    {
      key: 'adminCapabilityDenyEvents',
      observed: adminCapabilityDenyEvents,
      threshold: thresholds.adminCapabilityDenyEvents,
    },
  ];
  return alerts.filter((entry) => entry.observed >= entry.threshold);
};

const maybeLogThresholdAlert = (
  payload: PayloadLike,
  alert: AuthorizationDecisionAlert,
): void => {
  if (!payload?.logger?.warn) return;
  if (alert.observed <= 0) return;
  if (alert.observed % alert.threshold !== 0) return;
  payload.logger.warn(
    {
      event: 'authorization_decision_alert',
      key: alert.key,
      observed: alert.observed,
      threshold: alert.threshold,
    },
    '[authorization] decision alert threshold reached',
  );
};

export const getAuthorizationDecisionTelemetrySnapshot = () => ({
  alertThresholds: resolveAlertThresholds(),
  alerts: buildTriggeredAlerts(resolveAlertThresholds()),
  observedEvents,
  allowEvents,
  denyEvents,
  elevatedAllowEvents,
  elevatedReadAllowEvents,
  elevatedEditAllowEvents,
  adminCapabilityDenyEvents,
  lastEventAt,
  counters: Array.from(telemetryCounters.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value })),
});

export const resetAuthorizationDecisionTelemetry = () => {
  telemetryCounters.clear();
  observedEvents = 0;
  allowEvents = 0;
  denyEvents = 0;
  elevatedAllowEvents = 0;
  elevatedReadAllowEvents = 0;
  elevatedEditAllowEvents = 0;
  adminCapabilityDenyEvents = 0;
  lastEventAt = null;
};

const normalizeIdentifier = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normalizeIdentifier((value as { id?: unknown }).id);
  }
  return null;
};

const normalizeRole = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const recordAuthorizationDecision = ({
  payload,
  capability,
  allowed,
  reasonCode,
  actorId,
  actorRole,
  resourceType,
  resourceId,
  resourceSlug,
  metadata,
}: {
  payload: PayloadLike;
  capability: string;
  allowed: boolean;
  reasonCode: string;
  actorId: unknown;
  actorRole: unknown;
  resourceType: string;
  resourceId?: unknown;
  resourceSlug?: unknown;
  metadata?: Record<string, unknown>;
}): void => {
  const logger = payload?.logger;
  const message = '[authorization] capability decision';
  const decision = allowed ? 'allow' : 'deny';
  const entry: Record<string, unknown> = {
    event: 'authorization_decision',
    capability,
    decision,
    reasonCode,
    actorId: normalizeIdentifier(actorId),
    actorRole: normalizeRole(actorRole),
    resourceType,
    resourceId: normalizeIdentifier(resourceId),
    resourceSlug:
      typeof resourceSlug === 'string' && resourceSlug.trim().length > 0
        ? resourceSlug.trim()
        : null,
  };

  if (metadata && Object.keys(metadata).length > 0) {
    entry.metadata = metadata;
  }

  bumpCounter(`${capability}:${decision}:${reasonCode}`);
  observedEvents += 1;
  lastEventAt = new Date().toISOString();

  const isElevatedCapability = ELEVATED_CAPABILITIES.has(capability);
  if (allowed) {
    allowEvents += 1;
    if (isElevatedCapability) {
      elevatedAllowEvents += 1;
      if (capability === 'adminReadAllContent') {
        elevatedReadAllowEvents += 1;
      } else if (capability === 'adminEditAllContent') {
        elevatedEditAllowEvents += 1;
      }
    }
  } else {
    denyEvents += 1;
    if (isElevatedCapability) {
      adminCapabilityDenyEvents += 1;
    }
  }

  if (allowed) {
    logger?.info?.(entry, message);
    const thresholds = resolveAlertThresholds();
    buildTriggeredAlerts(thresholds).forEach((alert) => maybeLogThresholdAlert(payload, alert));
    return;
  }
  logger?.warn?.(entry, message);
  const thresholds = resolveAlertThresholds();
  buildTriggeredAlerts(thresholds).forEach((alert) => maybeLogThresholdAlert(payload, alert));
};
