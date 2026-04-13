import type { CrewRole } from '@astralpirates/shared/crewRoles';

export type BalanceCheck = {
  email: string;
  role: CrewRole;
  required: number;
  actual: number | null;
  missing: boolean;
};

export type BalanceCheckSummary = {
  missingUsers: BalanceCheck[];
  insufficient: BalanceCheck[];
  ok: BalanceCheck[];
};

export const normalizeElsa = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
};

export const summarizeBalanceChecks = (checks: BalanceCheck[]): BalanceCheckSummary => {
  const missingUsers: BalanceCheck[] = [];
  const insufficient: BalanceCheck[] = [];
  const ok: BalanceCheck[] = [];

  for (const check of checks) {
    if (check.missing) {
      missingUsers.push(check);
      continue;
    }
    if (check.required > 0 && (check.actual ?? 0) < check.required) {
      insufficient.push(check);
      continue;
    }
    ok.push(check);
  }

  return { missingUsers, insufficient, ok };
};
