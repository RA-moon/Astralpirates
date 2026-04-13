const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const GOVERNANCE_MODES = new Set(['off', 'shadow', 'enforce']);
const AUDIT_MODES = new Set(['deny-only', 'all']);

export type MediaGovernanceMode = 'off' | 'shadow' | 'enforce';
export type MediaGovernanceAuditMode = 'deny-only' | 'all';
export type FlightPlanMediaVisibility = 'inherit' | 'crew_only';
export type MediaGovernanceDecision = 'allow' | 'deny';

type UserLike =
  | {
      id?: unknown;
      role?: unknown;
    }
  | null
  | undefined;

type PayloadLoggerLike = {
  logger?: {
    info?: (meta: Record<string, unknown>, message: string) => void;
    warn?: (meta: Record<string, unknown>, message: string) => void;
  };
};

type MediaAuditRecord = {
  payload?: PayloadLoggerLike | null;
  user?: UserLike;
  scope: string;
  action: 'view' | 'download' | 'modify';
  decision: MediaGovernanceDecision;
  mode: MediaGovernanceMode;
  status?: number | null;
  reason?: string | null;
  relativePath?: string | null;
  metadata?: Record<string, unknown>;
};

const normaliseBooleanEnv = (value: string | undefined): boolean => {
  if (typeof value !== 'string') return false;
  return TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalizeMode = (value: string | undefined): MediaGovernanceMode | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!GOVERNANCE_MODES.has(normalized)) return null;
  return normalized as MediaGovernanceMode;
};

const normalizeAuditMode = (value: string | undefined): MediaGovernanceAuditMode => {
  if (typeof value !== 'string') return 'deny-only';
  const normalized = value.trim().toLowerCase();
  if (!AUDIT_MODES.has(normalized)) return 'deny-only';
  return normalized as MediaGovernanceAuditMode;
};

const normalizeRole = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeId = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = `${value}`.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normalizeId((value as { id?: unknown }).id);
  }
  return null;
};

const resolveAuditEnabled = (): boolean =>
  normaliseBooleanEnv(process.env.MEDIA_GOV_AUDIT_ENABLED);

const resolveAuditMode = (): MediaGovernanceAuditMode =>
  normalizeAuditMode(process.env.MEDIA_GOV_AUDIT_MODE);

const resolveAuditSummaryEvery = (): number =>
  parsePositiveInteger(process.env.MEDIA_GOV_AUDIT_SUMMARY_EVERY, 50);

let auditEventCount = 0;
const auditCounters = new Map<string, number>();

const bumpCounter = (key: string): void => {
  const nextValue = (auditCounters.get(key) ?? 0) + 1;
  auditCounters.set(key, nextValue);
};

export const resolveMediaGovernanceMode = (): MediaGovernanceMode => {
  const explicitMode = normalizeMode(process.env.MEDIA_GOVERNANCE_MODE);
  if (explicitMode) return explicitMode;

  // Backward-compatible fallback for legacy flag usage.
  if (normaliseBooleanEnv(process.env.MEDIA_GOVERNANCE_ENFORCED)) {
    return 'enforce';
  }
  return 'off';
};

export const isMediaGovernanceEnforced = (): boolean =>
  resolveMediaGovernanceMode() === 'enforce';

export const resolveFlightPlanMediaVisibility = (
  value: unknown,
): FlightPlanMediaVisibility => {
  if (typeof value !== 'string') return 'inherit';
  const normalized = value.trim().toLowerCase();
  return normalized === 'crew_only' ? 'crew_only' : 'inherit';
};

export const recordMediaGovernanceAudit = ({
  payload,
  user,
  scope,
  action,
  decision,
  mode,
  status = null,
  reason = null,
  relativePath = null,
  metadata,
}: MediaAuditRecord): void => {
  if (!resolveAuditEnabled()) return;
  if (resolveAuditMode() === 'deny-only' && decision === 'allow') return;

  const payloadLogger = payload?.logger;
  const userId = normalizeId(user?.id);
  const userRole = normalizeRole(user?.role);
  const record = {
    event: 'media_governance_access',
    scope,
    action,
    decision,
    mode,
    status,
    reason,
    relativePath,
    userId,
    userRole,
    ...(metadata ?? {}),
  };

  if (decision === 'deny') {
    payloadLogger?.warn?.(record, '[media-governance] access denied');
  } else {
    payloadLogger?.info?.(record, '[media-governance] access allowed');
  }

  const counterKey = `${scope}:${action}:${decision}`;
  bumpCounter(counterKey);
  auditEventCount += 1;

  const summaryEvery = resolveAuditSummaryEvery();
  if (auditEventCount % summaryEvery !== 0) return;
  const counters = Array.from(auditCounters.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
  payloadLogger?.info?.(
    {
      event: 'media_governance_audit_summary',
      observedEvents: auditEventCount,
      counters,
    },
    '[media-governance] audit summary',
  );
};
