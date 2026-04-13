process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { parseLogTitle } from '../utils/logTitles';
import { formatTimestamp, timestampSlugToDate } from '@astralpirates/shared/logs';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const outputPath = path.join(projectRoot, 'seed', 'data', 'logs.json');

const run = async () => {
  await payload.init({ config: payloadConfig });

  try {
    const logs = await payload.find({
      collection: 'logs',
      depth: 1,
      limit: 1000,
      sort: 'createdAt',
      overrideAccess: true,
    });

    const entries = logs.docs.map((doc) => {
      const owner = doc.owner as any;
      const parsedTitle = parseLogTitle(doc.title);
      const slug = typeof doc.slug === 'string' ? doc.slug : undefined;
      const stampDate =
        (slug ? timestampSlugToDate(slug) : null)
        ?? (doc.logDate ? new Date(doc.logDate) : null)
        ?? (doc.createdAt ? new Date(doc.createdAt) : null)
        ?? new Date();
      const stamp = formatTimestamp(stampDate);

      return {
        slug: slug ?? stamp,
        path: doc.path ?? `logbook/logs/${slug ?? stamp}`,
        dateCode: doc.dateCode ?? stamp,
        logDate: doc.logDate ?? stampDate.toISOString(),
        body: doc.body,
        ownerEmail: owner?.email ?? null,
        note: parsedTitle.note ?? null,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
      };
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    console.log(`Exported ${entries.length} logs to ${outputPath}`);
  } finally {
    await closePayloadLifecycle(payload);
  }
};

run().catch((error) => {
  console.error('[exportLogs] Failed to export logs');
  console.error(error);
  process.exitCode = 1;
});
