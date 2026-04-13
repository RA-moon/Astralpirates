import type { Payload } from 'payload';

import { CAPTAIN_ROLE } from '@astralpirates/shared/crewRoles';
import { grantElsa } from '@/src/services/elsaLedger';

const BATCH_SIZE = 250;
const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
};

const CAPTAIN_MIN_TOKENS = parsePositiveInt(process.env.ELSA_TOPUP_CAPTAIN_MIN_TOKENS, 10);
const CREW_MIN_TOKENS = parsePositiveInt(process.env.ELSA_TOPUP_CREW_MIN_TOKENS, 1);

const normaliseTokenValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
};

export type ElsaTopUpSummary = {
  checked: number;
  updated: number;
  durationMs: number;
};

export const calculateElsaTopUp = (
  role: string | null | undefined,
  currentTokens: unknown,
): { shouldUpdate: boolean; nextTokens: number } => {
  const current = normaliseTokenValue(currentTokens);
  const target = role === CAPTAIN_ROLE ? CAPTAIN_MIN_TOKENS : CREW_MIN_TOKENS;
  if (current >= target) {
    return { shouldUpdate: false, nextTokens: current };
  }
  return { shouldUpdate: true, nextTokens: target };
};

export const runElsaTopUpSweep = async (instance: Payload): Promise<ElsaTopUpSummary> => {
  const logger = instance.logger?.child?.({ worker: 'elsa-top-up' }) ?? instance.logger ?? console;
  const summary: ElsaTopUpSummary = { checked: 0, updated: 0, durationMs: 0 };
  const startedAt = Date.now();
  let page = 1;
  const sweepCycleId = new Date().toISOString().slice(0, 10);

  while (true) {
    const result = await instance.find({
      collection: 'users',
      page,
      limit: BATCH_SIZE,
      depth: 0,
      overrideAccess: true,
    });

    if (result.docs.length === 0) {
      break;
    }

    for (const doc of result.docs) {
      summary.checked += 1;
      const currentTokens = normaliseTokenValue((doc as any)?.elsaTokens ?? null);
      const { shouldUpdate, nextTokens } = calculateElsaTopUp(
        (doc as any)?.role ?? null,
        currentTokens,
      );
      if (!shouldUpdate) continue;
      const delta = Math.max(0, nextTokens - currentTokens);
      if (delta <= 0) continue;

      try {
        await grantElsa({
          payload: instance,
          userId: doc.id as number,
          amount: delta,
          type: 'top_up',
          metadata: {
            reason: 'weekly_top_up',
            cycle: sweepCycleId,
          },
          idempotencyKey: `elsa-top-up:${sweepCycleId}:${doc.id}`,
        });
        summary.updated += 1;
      } catch (error) {
        logger.warn?.({ err: error, userId: doc.id }, '[elsa-top-up] Failed to update user tokens');
      }
    }

    if (result.docs.length < BATCH_SIZE) {
      break;
    }

    page += 1;
  }

  summary.durationMs = Date.now() - startedAt;
  logger.info?.({ ...summary }, '[elsa-top-up] Sweep complete');
  return summary;
};

export const formatElsaTopUpSummary = (summary: ElsaTopUpSummary): string =>
  `[elsa-top-up] checked: ${summary.checked}, updated: ${summary.updated}, duration: ${summary.durationMs}ms`;
