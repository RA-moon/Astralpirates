import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { loadDefaultEnvOrder } from '@/config/loadEnv';
import {
  resolveScriptRunProfile,
  runDatabasePreflight,
} from '@/src/scripts/_lib/dbPreflight.ts';
import { isDirectExecution } from '@/src/scripts/_lib/directExecution';

const LOCKED_RELS_TABLE = 'payload_locked_documents_rels';
const GENERATED_SCHEMA_PATH = path.resolve(process.cwd(), 'src/payload-generated-schema.ts');
const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const cmsDir = path.resolve(dirname, '../../..');
const repoRoot = path.resolve(cmsDir, '..');
loadDefaultEnvOrder(repoRoot, cmsDir);

const TABLE_BLOCK_PATTERN =
  /export const payload_locked_documents_rels = pgTable\(\s*"payload_locked_documents_rels",\s*\{([\s\S]*?)\n\s*\},\s*\(columns\)\s*=>/m;
const COLUMN_PATTERN = /:\s*(?:serial|integer)\("([^"]+)"\)/g;

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

export const extractRequiredLockedRelsColumns = (schemaSource: string): string[] => {
  const tableMatch = schemaSource.match(TABLE_BLOCK_PATTERN);
  if (!tableMatch?.[1]) {
    throw new Error(
      '[locked-doc-rels-schema-check] Could not locate payload_locked_documents_rels table definition in payload-generated-schema.ts.',
    );
  }

  const requiredColumns: string[] = [];
  let columnMatch: RegExpExecArray | null = null;
  while ((columnMatch = COLUMN_PATTERN.exec(tableMatch[1])) !== null) {
    const columnName = columnMatch[1]?.trim();
    if (!columnName) continue;
    if (!columnName.endsWith('_id')) continue;
    requiredColumns.push(columnName);
  }

  const normalized = uniqueSorted(requiredColumns);
  if (!normalized.length) {
    throw new Error(
      '[locked-doc-rels-schema-check] No *_id columns were extracted from payload_locked_documents_rels in payload-generated-schema.ts.',
    );
  }

  return normalized;
};

const loadRequiredColumns = async (): Promise<string[]> => {
  const schemaSource = await fs.readFile(GENERATED_SCHEMA_PATH, 'utf8');
  return extractRequiredLockedRelsColumns(schemaSource);
};

const loadExistingColumns = async (): Promise<string[]> => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('[locked-doc-rels-schema-check] DATABASE_URL is not set.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
      `,
      [LOCKED_RELS_TABLE],
    );

    return uniqueSorted(result.rows.map((row) => row.column_name).filter(Boolean));
  } finally {
    await client.end().catch(() => null);
  }
};

export const checkLockedDocumentRelsSchema = async () => {
  const runProfile = resolveScriptRunProfile();
  const preflight = await runDatabasePreflight({
    runProfile,
    scriptName: 'locked-doc-rels-schema-check',
    requiredTables: [LOCKED_RELS_TABLE],
  });

  preflight.warnings.forEach((warning) => {
    // eslint-disable-next-line no-console
    console.warn(warning);
  });

  const requiredColumns = await loadRequiredColumns();
  const existingColumns = await loadExistingColumns();
  const existingSet = new Set(existingColumns);

  const missing = requiredColumns.filter((columnName) => !existingSet.has(columnName));
  if (missing.length) {
    throw new Error(
      [
        `[locked-doc-rels-schema-check] Missing columns in public.${LOCKED_RELS_TABLE}: ${missing.join(', ')}.`,
        'Run Payload migrations before continuing:',
        '`pnpm --dir cms payload migrate -- --config ./payload.config.ts`',
      ].join(' '),
    );
  }

  const extra = existingColumns.filter(
    (columnName) => columnName.endsWith('_id') && !requiredColumns.includes(columnName),
  );
  if (extra.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[locked-doc-rels-schema-check] Extra *_id columns present in public.${LOCKED_RELS_TABLE}: ${extra.join(', ')}`,
    );
  }

  // eslint-disable-next-line no-console
  console.info(
    `[locked-doc-rels-schema-check] OK table=${LOCKED_RELS_TABLE} required=${requiredColumns.length} present=${existingColumns.length} profile=${preflight.runProfile} runtime=${preflight.runtime}`,
  );
};

if (isDirectExecution(import.meta.url)) {
  checkLockedDocumentRelsSchema().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[locked-doc-rels-schema-check] failed', error);
    process.exit(1);
  });
}
