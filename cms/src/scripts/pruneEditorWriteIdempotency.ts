process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  cleanupExpiredEditorWriteIdempotency,
  resolveEditorIdempotencyCleanupBatchSize,
  resolveEditorIdempotencyCleanupMaxBatches,
  resolveEditorIdempotencyRetentionDays,
} from '@/app/api/_lib/editorWrites';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const readNumericArg = (name: string): number | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const raw = process.argv[index + 1];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

const main = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ script: 'prune-editor-write-idempotency' }) ?? instance.logger ?? console;

  const retentionDays = resolveEditorIdempotencyRetentionDays(readNumericArg('--retention-days'));
  const batchSize = resolveEditorIdempotencyCleanupBatchSize(readNumericArg('--batch-size'));
  const maxBatches = resolveEditorIdempotencyCleanupMaxBatches(readNumericArg('--max-batches'));

  logger.info?.(
    {
      retentionDays,
      batchSize,
      maxBatches,
    },
    '[editor-idempotency] starting prune sweep',
  );

  const summary = await cleanupExpiredEditorWriteIdempotency({
    payload: instance,
    retentionDays,
    batchSize,
    maxBatches,
  });

  logger.info?.(
    summary,
    '[editor-idempotency] prune sweep complete',
  );

  if (summary.reachedBatchLimit) {
    logger.warn?.(
      summary,
      '[editor-idempotency] prune sweep reached batch limit before draining all stale rows',
    );
  }

  await closePayloadLifecycle(instance);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[editor-idempotency] prune script failed', error);
    process.exit(1);
  });
