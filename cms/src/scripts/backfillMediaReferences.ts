process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import { reconcileAllMediaReferences } from '@/src/services/mediaLifecycle';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const parseArgs = (): {
  apply: boolean;
  pageSize: number | null;
} => {
  const args = process.argv.slice(2);
  const argSet = new Set(args);
  const pageSizeFlagIndex = args.findIndex((value) => value === '--page-size');
  const pageSizeValue =
    pageSizeFlagIndex >= 0 && pageSizeFlagIndex + 1 < args.length
      ? Number.parseInt(args[pageSizeFlagIndex + 1] ?? '', 10)
      : null;
  return {
    apply: argSet.has('--apply'),
    pageSize:
      Number.isFinite(pageSizeValue) && (pageSizeValue as number) > 0
        ? Math.trunc(pageSizeValue as number)
        : null,
  };
};

const main = async () => {
  const options = parseArgs();
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger ?? console;

  logger.info?.(
    {
      apply: options.apply,
      pageSize: options.pageSize ?? 'default',
    },
    '[media-lifecycle] starting media reference backfill',
  );

  const summary = await reconcileAllMediaReferences(instance, {
    dryRun: !options.apply,
    pageSize: options.pageSize ?? undefined,
    logger,
  });

  logger.info?.({ summary }, '[media-lifecycle] media reference backfill complete');

  await closePayloadLifecycle(instance);
};

main().catch((error) => {
  console.error('[media-lifecycle] media reference backfill failed', error);
  process.exit(1);
});
