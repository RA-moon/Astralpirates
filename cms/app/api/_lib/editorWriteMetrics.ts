import { Counter, Pushgateway, Registry } from 'prom-client';

import type { EditorDocumentType } from '@/app/api/_lib/editorWrites';

type Logger = {
  warn?: (meta: Record<string, unknown>, message?: string) => void;
};

type EditorWriteMetrics = {
  writeAttempts: Counter<string>;
  writeCommits: Counter<string>;
  writeConflicts: Counter<string>;
  lockAcquire: Counter<string>;
  lockTakeover: Counter<string>;
  idempotencyReplay: Counter<string>;
  push: () => void;
};

let cached: EditorWriteMetrics | null = null;

const init = (logger: Logger): EditorWriteMetrics => {
  const registry = new Registry();

  const writeAttempts = new Counter({
    name: 'editor_write_attempt_total',
    help: 'Total editor write attempts by document type',
    labelNames: ['document_type'],
    registers: [registry],
  });

  const writeCommits = new Counter({
    name: 'editor_write_commit_total',
    help: 'Total successful editor write commits by document type',
    labelNames: ['document_type'],
    registers: [registry],
  });

  const writeConflicts = new Counter({
    name: 'editor_write_conflict_total',
    help: 'Total editor write conflicts by document type and conflict reason',
    labelNames: ['document_type', 'reason'],
    registers: [registry],
  });

  const lockAcquire = new Counter({
    name: 'editor_lock_acquire_total',
    help: 'Total editor lock acquire outcomes by document type',
    labelNames: ['document_type', 'result'],
    registers: [registry],
  });

  const lockTakeover = new Counter({
    name: 'editor_lock_takeover_total',
    help: 'Total editor lock takeover outcomes by document type',
    labelNames: ['document_type', 'result'],
    registers: [registry],
  });

  const idempotencyReplay = new Counter({
    name: 'editor_idempotency_replay_total',
    help: 'Total idempotency replay responses by document type',
    labelNames: ['document_type'],
    registers: [registry],
  });

  const pushUrl = process.env.EDITOR_WRITE_PROM_PUSHGATEWAY_URL;
  const pushJobName =
    process.env.EDITOR_WRITE_PROM_PUSH_JOB_NAME ?? 'editor-write-consistency';
  const pushIntervalMs =
    Number.parseInt(process.env.EDITOR_WRITE_PROM_PUSH_INTERVAL_MS ?? '60000', 10) ||
    60000;
  const pushGateway = pushUrl ? new Pushgateway(pushUrl, {}, registry) : null;

  let pushScheduled = false;
  const push = () => {
    if (!pushGateway || pushScheduled) return;
    pushScheduled = true;

    setTimeout(async () => {
      try {
        await pushGateway.pushAdd({ jobName: pushJobName });
      } catch (error) {
        logger.warn?.(
          {
            err: error,
            pushJobName,
          },
          '[editor-write-metrics] push failed',
        );
      } finally {
        pushScheduled = false;
      }
    }, pushIntervalMs).unref?.();
  };

  return {
    writeAttempts,
    writeCommits,
    writeConflicts,
    lockAcquire,
    lockTakeover,
    idempotencyReplay,
    push,
  };
};

const getMetrics = (logger: Logger): EditorWriteMetrics => {
  if (cached) return cached;
  cached = init(logger);
  return cached;
};

export const recordEditorWriteAttempt = (
  logger: Logger,
  documentType: EditorDocumentType,
): void => {
  const metrics = getMetrics(logger);
  metrics.writeAttempts.inc({ document_type: documentType });
  metrics.push();
};

export const recordEditorWriteCommit = (
  logger: Logger,
  documentType: EditorDocumentType,
): void => {
  const metrics = getMetrics(logger);
  metrics.writeCommits.inc({ document_type: documentType });
  metrics.push();
};

export const recordEditorWriteConflict = (
  logger: Logger,
  documentType: EditorDocumentType,
  reason: string,
): void => {
  const metrics = getMetrics(logger);
  metrics.writeConflicts.inc({
    document_type: documentType,
    reason,
  });
  metrics.push();
};

export const recordEditorLockAcquire = (
  logger: Logger,
  documentType: EditorDocumentType,
  result: 'acquired' | 'blocked',
): void => {
  const metrics = getMetrics(logger);
  metrics.lockAcquire.inc({ document_type: documentType, result });
  metrics.push();
};

export const recordEditorLockTakeover = (
  logger: Logger,
  documentType: EditorDocumentType,
  result: 'taken_over' | 'blocked' | 'not_found',
): void => {
  const metrics = getMetrics(logger);
  metrics.lockTakeover.inc({ document_type: documentType, result });
  metrics.push();
};

export const recordEditorIdempotencyReplay = (
  logger: Logger,
  documentType: EditorDocumentType,
): void => {
  const metrics = getMetrics(logger);
  metrics.idempotencyReplay.inc({ document_type: documentType });
  metrics.push();
};
