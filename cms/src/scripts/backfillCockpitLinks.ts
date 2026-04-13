import payload from 'payload';

import {
  resolveScriptRunProfile,
  runDatabasePreflight,
} from '@/src/scripts/_lib/dbPreflight.ts';

const LEGACY_SELF_PROFILE_PATH = '/gangway/crew-quarters/profile';
const COCKPIT_PROFILE_PATH = '/gangway/cockpit';
const PAGE_SIZE = 100;
const WRITE_FLAG = '--write';

type RewriteResult<T> = {
  value: T;
  changed: boolean;
};

const rewriteLegacySelfProfileHref = (input: string): RewriteResult<string> => {
  const value = input.trim();
  if (!value.startsWith('/')) {
    return { value: input, changed: false };
  }

  try {
    const parsed = new URL(value, 'https://astralpirates.com');
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath !== LEGACY_SELF_PROFILE_PATH) {
      return { value: input, changed: false };
    }
    const next = `${COCKPIT_PROFILE_PATH}${parsed.search}${parsed.hash}`;
    return { value: next, changed: next !== input };
  } catch {
    return { value: input, changed: false };
  }
};

const rewriteNode = (node: unknown): RewriteResult<unknown> => {
  if (typeof node === 'string') {
    return rewriteLegacySelfProfileHref(node);
  }

  if (Array.isArray(node)) {
    let changed = false;
    const nextArray = node.map((entry) => {
      const rewritten = rewriteNode(entry);
      changed = changed || rewritten.changed;
      return rewritten.value;
    });
    return { value: changed ? nextArray : node, changed };
  }

  if (!node || typeof node !== 'object') {
    return { value: node, changed: false };
  }

  let changed = false;
  const nextObject: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const rewritten = rewriteNode(value);
    changed = changed || rewritten.changed;
    nextObject[key] = rewritten.value;
  }

  return { value: changed ? nextObject : node, changed };
};

const main = async () => {
  const runProfile = resolveScriptRunProfile();
  const writeEnabled = process.argv.includes(WRITE_FLAG);
  process.env.NODE_ENV = process.env.NODE_ENV ?? (runProfile === 'prod' ? 'production' : 'development');

  const preflight = await runDatabasePreflight({
    runProfile,
    scriptName: 'cockpit-link-backfill',
    requiredTables: ['pages'],
  });
  preflight.warnings.forEach((warning) => {
    // eslint-disable-next-line no-console
    console.warn(warning);
  });
  // eslint-disable-next-line no-console
  console.info(
    `[cockpit-link-backfill] DB target ${preflight.target.host}:${preflight.target.port}/${preflight.target.database} (profile=${preflight.runProfile}, runtime=${preflight.runtime}, write=${writeEnabled})`,
  );

  const payloadConfig = (await import('@/payload.config.ts')).default;
  const payloadInstance = await payload.init({ config: payloadConfig });
  const logger = payloadInstance.logger?.child({ script: 'cockpit-link-backfill' }) ?? console;

  let page = 1;
  let scanned = 0;
  let matched = 0;
  let updated = 0;
  const touchedPaths: string[] = [];

  while (true) {
    const result = await payloadInstance.find({
      collection: 'pages',
      limit: PAGE_SIZE,
      page,
      depth: 0,
      select: {
        id: true,
        path: true,
        layout: true,
      },
      overrideAccess: true,
    });

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      scanned += 1;
      const rewritten = rewriteNode(doc.layout ?? null);
      if (!rewritten.changed) continue;

      matched += 1;
      const path = typeof doc.path === 'string' ? doc.path : String(doc.id ?? 'unknown');
      touchedPaths.push(path);

      if (!writeEnabled) continue;

      await payloadInstance.update({
        collection: 'pages',
        id: doc.id as number | string,
        data: {
          layout: rewritten.value as unknown[],
        },
        overrideAccess: true,
      });
      updated += 1;
    }

    if ((result.page ?? page) >= (result.totalPages ?? page)) break;
    page += 1;
  }

  logger.info?.(
    {
      scanned,
      matched,
      updated,
      writeEnabled,
      touchedPaths: touchedPaths.slice(0, 20),
      remainingPathsCount: Math.max(touchedPaths.length - 20, 0),
    },
    '[cockpit-link-backfill] completed',
  );

  await payloadInstance.db?.destroy?.().catch(() => null);
};

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Cockpit link backfill complete.');
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[cockpit-link-backfill] failed', error);
    process.exit(1);
  });
