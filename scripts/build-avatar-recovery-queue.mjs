#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const usage = () => {
  console.log(`Usage: node scripts/build-avatar-recovery-queue.mjs [options]

Builds an actionable avatar recovery queue from avatar storage audit JSON.

Options:
  --audit-json <path>      Avatar storage audit JSON path (required)
  --output-tsv <path>      Queue TSV output path (required)
  --output-md <path>       Optional markdown output path
  --include-url-mismatch   Include url_mismatch rows (default: included)
  --exclude-url-mismatch   Exclude url_mismatch rows
  -h, --help               Show help
`);
};

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const parseArgs = () => {
  const args = process.argv.slice(2);
  let auditJson = '';
  let outputTsv = '';
  let outputMd = '';
  let includeUrlMismatch = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--audit-json' && typeof next === 'string') {
      auditJson = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--output-tsv' && typeof next === 'string') {
      outputTsv = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--output-md' && typeof next === 'string') {
      outputMd = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--include-url-mismatch') {
      includeUrlMismatch = true;
      continue;
    }
    if (arg === '--exclude-url-mismatch') {
      includeUrlMismatch = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!auditJson) throw new Error('--audit-json is required.');
  if (!outputTsv) throw new Error('--output-tsv is required.');

  return {
    auditJson,
    outputTsv,
    outputMd: outputMd || null,
    includeUrlMismatch,
  };
};

const resolveQueueReason = ({ row, includeUrlMismatch }) => {
  const klass = trim(row?.class);
  if (klass === 'missing_object') {
    return 'missing-object-backup-or-reupload';
  }

  if (klass === 'missing_local') {
    const seaweedEnabled = row?.seaweed?.enabled === true;
    const seaweedExists = row?.seaweed?.exists === true;
    if (seaweedEnabled && seaweedExists) {
      return null;
    }
    return 'missing-local-source-backup-or-reupload';
  }

  if (klass === 'url_mismatch') {
    if (!includeUrlMismatch) return null;
    return 'url-mismatch-manual-reconcile';
  }

  return null;
};

const toQueueRow = ({ row, reason }) => ({
  profileSlug: trim(row?.profileSlug) || '',
  callSign: trim(row?.callSign) || '',
  userId: row?.userId ?? '',
  class: trim(row?.class) || '',
  reason,
  avatarId: trim(row?.avatarId) || '',
  canonicalFilename: trim(row?.canonicalFilename) || '',
  avatarUrl: trim(row?.avatarUrl) || '',
  localExists: row?.localExists === true ? '1' : '0',
  seaweedExists:
    row?.seaweed && typeof row.seaweed.exists === 'boolean'
      ? row.seaweed.exists
        ? '1'
        : '0'
      : '',
  notes: Array.isArray(row?.notes)
    ? row.notes.map((entry) => trim(entry)).filter((entry) => entry.length > 0).join('; ')
    : '',
});

const toTsv = (rows) => {
  const header = [
    'profile_slug',
    'call_sign',
    'user_id',
    'class',
    'reason',
    'avatar_id',
    'canonical_filename',
    'avatar_url',
    'local_exists',
    'seaweed_exists',
    'notes',
  ].join('\t');

  const body = rows.map((row) =>
    [
      row.profileSlug,
      row.callSign,
      String(row.userId),
      row.class,
      row.reason,
      row.avatarId,
      row.canonicalFilename,
      row.avatarUrl,
      row.localExists,
      row.seaweedExists,
      row.notes,
    ].join('\t'),
  );

  return `${[header, ...body].join('\n')}\n`;
};

const toMarkdown = ({ rows, auditJson }) => {
  const lines = [];
  lines.push('# Avatar Recovery Queue');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Audit source: \`${auditJson}\``);
  lines.push(`- Queue size: **${rows.length}**`);
  lines.push('');
  lines.push('| Profile Slug | User | Class | Reason | Canonical Filename |');
  lines.push('|---|---:|---|---|---|');
  for (const row of rows) {
    lines.push(
      `| ${row.profileSlug || '-'} | ${row.userId || '-'} | ${row.class} | ${row.reason} | ${row.canonicalFilename || '-'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
};

const run = () => {
  const options = parseArgs();
  const payload = JSON.parse(fs.readFileSync(options.auditJson, 'utf8'));
  const users = Array.isArray(payload?.users) ? payload.users : [];

  const rows = users
    .map((row) => {
      const reason = resolveQueueReason({
        row,
        includeUrlMismatch: options.includeUrlMismatch,
      });
      if (!reason) return null;
      return toQueueRow({ row, reason });
    })
    .filter((row) => row != null);

  rows.sort((a, b) => {
    if (a.class === b.class) {
      return a.profileSlug.localeCompare(b.profileSlug);
    }
    return a.class.localeCompare(b.class);
  });

  fs.mkdirSync(path.dirname(options.outputTsv), { recursive: true });
  fs.writeFileSync(options.outputTsv, toTsv(rows), 'utf8');
  console.log(`[avatar-recovery-queue] wrote tsv: ${options.outputTsv}`);
  console.log(`[avatar-recovery-queue] rows=${rows.length}`);

  if (options.outputMd) {
    fs.mkdirSync(path.dirname(options.outputMd), { recursive: true });
    fs.writeFileSync(
      options.outputMd,
      toMarkdown({
        rows,
        auditJson: options.auditJson,
      }),
      'utf8',
    );
    console.log(`[avatar-recovery-queue] wrote markdown: ${options.outputMd}`);
  }
};

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[avatar-recovery-queue] FAILED: ${message}`);
  process.exit(1);
}
