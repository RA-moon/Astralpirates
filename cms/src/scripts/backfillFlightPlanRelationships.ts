import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  isNeo4jSyncDisabled,
  closeNeo4jDriver,
  removeLegacyPlanRelationshipEdges,
  requireNeo4jSyncEnabled,
} from '@/src/utils/neo4j.ts';
import { rebuildPlanRelationships } from '@/src/utils/neo4jRelationships.ts';
import { applyStandaloneNeo4jEnvFallback } from './_lib/neo4jScriptRuntime';

applyStandaloneNeo4jEnvFallback({ logPrefix: 'neo4j-backfill' });

const BATCH_SIZE = 25;
const BACKFILL_LEGACY_CLEANUP_ENABLED = (() => {
  const raw = (process.env.BACKFILL_LEGACY_CLEANUP ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();

type BackfillOptions = {
  maxPages: number | null;
  maxPlans: number | null;
  logEvery: number;
  planTimeoutMs: number;
};

const parsePositiveInteger = (value: string | undefined): number | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseArgs = (argv: string[]): BackfillOptions => {
  let maxPages = parsePositiveInteger(process.env.BACKFILL_MAX_PAGES);
  let maxPlans = parsePositiveInteger(process.env.BACKFILL_MAX_PLANS);
  let logEvery = parsePositiveInteger(process.env.BACKFILL_LOG_EVERY) ?? 25;
  let planTimeoutMs = parsePositiveInteger(process.env.BACKFILL_PLAN_TIMEOUT_MS) ?? 120_000;

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    const next = argv[idx + 1];
    if (arg === '--max-pages' && typeof next === 'string') {
      maxPages = parsePositiveInteger(next);
      idx += 1;
      continue;
    }
    if (arg === '--max-plans' && typeof next === 'string') {
      maxPlans = parsePositiveInteger(next);
      idx += 1;
      continue;
    }
    if (arg === '--log-every' && typeof next === 'string') {
      logEvery = parsePositiveInteger(next) ?? logEvery;
      idx += 1;
      continue;
    }
    if (arg === '--plan-timeout-ms' && typeof next === 'string') {
      planTimeoutMs = parsePositiveInteger(next) ?? planTimeoutMs;
      idx += 1;
      continue;
    }
  }

  if (logEvery <= 0) {
    logEvery = 25;
  }

  if (planTimeoutMs <= 0) {
    planTimeoutMs = 120_000;
  }

  return { maxPages, maxPlans, logEvery, planTimeoutMs };
};

const OPTIONS = parseArgs(process.argv.slice(2));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const main = async () => {
  requireNeo4jSyncEnabled('[neo4j-backfill]');
  if (isNeo4jSyncDisabled()) return;

  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.info('[neo4j-backfill] Starting', {
    batchSize: BATCH_SIZE,
    maxPages: OPTIONS.maxPages,
    maxPlans: OPTIONS.maxPlans,
    logEvery: OPTIONS.logEvery,
    planTimeoutMs: OPTIONS.planTimeoutMs,
    neo4jUri: process.env.NEO4J_URI,
  });
  // eslint-disable-next-line no-console
  console.info('[neo4j-backfill] Initializing Payload');
  const payloadInstance = await payload.init({ config: payloadConfig });
  // eslint-disable-next-line no-console
  console.info('[neo4j-backfill] Payload initialized');
  const logger = payloadInstance.logger?.child({ script: 'neo4j-backfill' }) ?? console;

  let page = 1;
  let processedPlans = 0;
  let processedPages = 0;
  let crewEdges = 0;
  let passengerEdges = 0;
  let carriageEdges = 0;
  let removedCrewEdges = 0;
  let removedPassengerEdges = 0;
  let removedCarriageEdges = 0;
  let stopReason: 'docs-exhausted' | 'last-partial-page' | 'max-pages' | 'max-plans' = 'docs-exhausted';

  if (BACKFILL_LEGACY_CLEANUP_ENABLED) {
    logger.info?.('[neo4j-backfill] Clearing legacy relationship edges');
    const cleanup = await removeLegacyPlanRelationshipEdges();
    logger.info?.(
      {
        deletedRelationships: cleanup.deletedRelationships,
        batches: cleanup.batches,
        truncated: cleanup.truncated,
      },
      '[neo4j-backfill] Legacy relationship cleanup complete',
    );
  } else {
    logger.info?.(
      '[neo4j-backfill] Skipping legacy relationship cleanup (set BACKFILL_LEGACY_CLEANUP=1 to enable)',
    );
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (OPTIONS.maxPages != null && processedPages >= OPTIONS.maxPages) {
      stopReason = 'max-pages';
      break;
    }

    logger.info?.({ page, processedPlans }, '[neo4j-backfill] Fetching page');
    const result = await payloadInstance.find({
      collection: 'flight-plans',
      page,
      limit: BATCH_SIZE,
      depth: 0,
      overrideAccess: true,
    });
    processedPages += 1;
    logger.info?.(
      {
        page,
        processedPages,
        docs: result.docs.length,
        totalDocs: result.totalDocs ?? null,
      },
      '[neo4j-backfill] Page fetched',
    );

    if (!result.docs.length) {
      stopReason = 'docs-exhausted';
      break;
    }

    for (const doc of result.docs) {
      if (OPTIONS.maxPlans != null && processedPlans >= OPTIONS.maxPlans) {
        stopReason = 'max-plans';
        break;
      }
      const planId = doc?.id;
      if (typeof planId === 'undefined' || planId === null) continue;

      const rebuildResult = await withTimeout(
        rebuildPlanRelationships(payloadInstance, planId),
        OPTIONS.planTimeoutMs,
        `[neo4j-backfill] rebuildPlanRelationships planId=${String(planId)}`,
      );
      crewEdges += rebuildResult.crewmateEdges;
      passengerEdges += rebuildResult.companionEdges;
      carriageEdges += rebuildResult.carriagedEdges;
      removedCrewEdges += rebuildResult.removedCrewmates;
      removedPassengerEdges += rebuildResult.removedCompanions;
      removedCarriageEdges += rebuildResult.removedCarriaged;

      processedPlans += 1;
      if (processedPlans % OPTIONS.logEvery === 0) {
        logger.info?.(
          {
            processedPlans,
            processedPages,
            crewEdges,
            passengerEdges,
            carriageEdges,
            removedCrewEdges,
            removedPassengerEdges,
            removedCarriageEdges,
          },
          '[neo4j-backfill] Progress',
        );
      }
    }

    if (stopReason === 'max-plans') break;
    if (result.docs.length < BATCH_SIZE) {
      stopReason = 'last-partial-page';
      break;
    }
    page += 1;
  }

  logger.info?.(
    {
      durationMs: Date.now() - startedAt,
      processedPlans,
      processedPages,
      stopReason,
      crewEdges,
      passengerEdges,
      carriageEdges,
      removedCrewEdges,
      removedPassengerEdges,
      removedCarriageEdges,
    },
    '[neo4j-backfill] Completed',
  );

  await payloadInstance.db?.destroy?.().catch(() => null);
  await closeNeo4jDriver();
};

main()
  .catch((error) => {
    console.error('[neo4j-backfill] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(() => {
    setImmediate(() => process.exit(process.exitCode ?? 0));
  });
