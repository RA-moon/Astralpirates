#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const usage = () => {
  console.log(`Usage: node scripts/build-avatar-audit-diff.mjs [options]

Builds a before/after diff from avatar storage audit JSON reports.

Options:
  --before-json <path>      Before audit JSON path (required)
  --after-json <path>       After audit JSON path (required)
  --output-json <path>      Optional diff JSON output path
  --output-md <path>        Optional markdown output path
  -h, --help                Show help
`);
};

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const parseArgs = () => {
  const args = process.argv.slice(2);
  let beforeJson = '';
  let afterJson = '';
  let outputJson = '';
  let outputMd = '';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--before-json' && typeof next === 'string') {
      beforeJson = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--after-json' && typeof next === 'string') {
      afterJson = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--output-json' && typeof next === 'string') {
      outputJson = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--output-md' && typeof next === 'string') {
      outputMd = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!beforeJson) throw new Error('--before-json is required.');
  if (!afterJson) throw new Error('--after-json is required.');

  return {
    beforeJson,
    afterJson,
    outputJson: outputJson || null,
    outputMd: outputMd || null,
  };
};

const rowKey = (row) => trim(row?.profileSlug) || `user:${row?.userId ?? 'unknown'}`;

const normaliseUsers = (payload) => (Array.isArray(payload?.users) ? payload.users : []);

const classCountsFromUsers = (users) => {
  const counts = {
    healthy: 0,
    missing_local: 0,
    missing_object: 0,
    url_mismatch: 0,
  };
  for (const row of users) {
    const klass = trim(row?.class);
    if (!Object.prototype.hasOwnProperty.call(counts, klass)) continue;
    counts[klass] += 1;
  }
  return counts;
};

const toBool = (value) => value === true;

const buildDiff = ({ beforePayload, afterPayload, beforePath, afterPath }) => {
  const beforeUsers = normaliseUsers(beforePayload);
  const afterUsers = normaliseUsers(afterPayload);

  const beforeMap = new Map(beforeUsers.map((row) => [rowKey(row), row]));
  const afterMap = new Map(afterUsers.map((row) => [rowKey(row), row]));
  const keys = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()])).sort((a, b) =>
    a.localeCompare(b),
  );

  const changedRows = [];
  for (const key of keys) {
    const before = beforeMap.get(key) ?? null;
    const after = afterMap.get(key) ?? null;

    const beforeClass = trim(before?.class) || null;
    const afterClass = trim(after?.class) || null;
    const beforeFilename = trim(before?.canonicalFilename) || null;
    const afterFilename = trim(after?.canonicalFilename) || null;
    const beforeSeaweedExists =
      before?.seaweed && typeof before.seaweed.exists === 'boolean'
        ? before.seaweed.exists
        : null;
    const afterSeaweedExists =
      after?.seaweed && typeof after.seaweed.exists === 'boolean' ? after.seaweed.exists : null;

    const changed =
      beforeClass !== afterClass ||
      beforeFilename !== afterFilename ||
      beforeSeaweedExists !== afterSeaweedExists;
    if (!changed) continue;

    changedRows.push({
      key,
      profileSlug: trim(after?.profileSlug) || trim(before?.profileSlug) || null,
      callSign: trim(after?.callSign) || trim(before?.callSign) || null,
      userId: after?.userId ?? before?.userId ?? null,
      beforeClass,
      afterClass,
      beforeFilename,
      afterFilename,
      beforeSeaweedExists,
      afterSeaweedExists,
      becameHealthy: beforeClass !== 'healthy' && afterClass === 'healthy',
      regressed: beforeClass === 'healthy' && afterClass !== 'healthy',
    });
  }

  const beforeCounts = classCountsFromUsers(beforeUsers);
  const afterCounts = classCountsFromUsers(afterUsers);

  const unresolvedAfter = afterUsers.filter((row) => trim(row?.class) !== 'healthy');

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      beforeJson: beforePath,
      afterJson: afterPath,
    },
    totals: {
      beforeUsers: beforeUsers.length,
      afterUsers: afterUsers.length,
      changedRows: changedRows.length,
      becameHealthy: changedRows.filter((row) => toBool(row.becameHealthy)).length,
      regressed: changedRows.filter((row) => toBool(row.regressed)).length,
      unresolvedAfter: unresolvedAfter.length,
    },
    classes: {
      before: beforeCounts,
      after: afterCounts,
    },
    changedRows,
    unresolvedAfter: unresolvedAfter.map((row) => ({
      profileSlug: trim(row?.profileSlug) || null,
      callSign: trim(row?.callSign) || null,
      userId: row?.userId ?? null,
      class: trim(row?.class) || null,
      canonicalFilename: trim(row?.canonicalFilename) || null,
      seaweedExists:
        row?.seaweed && typeof row.seaweed.exists === 'boolean' ? row.seaweed.exists : null,
      localExists: toBool(row?.localExists),
    })),
  };
};

const toMarkdown = (diff) => {
  const lines = [];
  lines.push('# Avatar Storage Audit Diff');
  lines.push('');
  lines.push(`- Generated at: ${diff.generatedAt}`);
  lines.push(`- Before: \`${diff.inputs.beforeJson}\``);
  lines.push(`- After: \`${diff.inputs.afterJson}\``);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Changed rows: **${diff.totals.changedRows}**`);
  lines.push(`- Became healthy: **${diff.totals.becameHealthy}**`);
  lines.push(`- Regressed: **${diff.totals.regressed}**`);
  lines.push(`- Unresolved after: **${diff.totals.unresolvedAfter}**`);
  lines.push('');
  lines.push('## Class Counts');
  lines.push('');
  lines.push(`- Before healthy: ${diff.classes.before.healthy}`);
  lines.push(`- After healthy: ${diff.classes.after.healthy}`);
  lines.push(`- Before missing_local: ${diff.classes.before.missing_local}`);
  lines.push(`- After missing_local: ${diff.classes.after.missing_local}`);
  lines.push(`- Before missing_object: ${diff.classes.before.missing_object}`);
  lines.push(`- After missing_object: ${diff.classes.after.missing_object}`);
  lines.push(`- Before url_mismatch: ${diff.classes.before.url_mismatch}`);
  lines.push(`- After url_mismatch: ${diff.classes.after.url_mismatch}`);
  lines.push('');
  lines.push('## Changed Rows (sample)');
  lines.push('');
  lines.push('| Profile | User | Before | After | Before file | After file |');
  lines.push('|---|---:|---|---|---|---|');
  for (const row of diff.changedRows.slice(0, 80)) {
    lines.push(
      `| ${row.profileSlug ?? row.key} | ${row.userId ?? '-'} | ${row.beforeClass ?? '-'} | ${row.afterClass ?? '-'} | ${row.beforeFilename ?? '-'} | ${row.afterFilename ?? '-'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
};

const run = () => {
  const options = parseArgs();
  const beforePayload = JSON.parse(fs.readFileSync(options.beforeJson, 'utf8'));
  const afterPayload = JSON.parse(fs.readFileSync(options.afterJson, 'utf8'));

  const diff = buildDiff({
    beforePayload,
    afterPayload,
    beforePath: options.beforeJson,
    afterPath: options.afterJson,
  });

  console.log(`[avatar-audit-diff] changedRows=${diff.totals.changedRows}`);
  console.log(`[avatar-audit-diff] becameHealthy=${diff.totals.becameHealthy}`);
  console.log(`[avatar-audit-diff] unresolvedAfter=${diff.totals.unresolvedAfter}`);

  if (options.outputJson) {
    fs.mkdirSync(path.dirname(options.outputJson), { recursive: true });
    fs.writeFileSync(options.outputJson, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
    console.log(`[avatar-audit-diff] wrote json: ${options.outputJson}`);
  }

  if (options.outputMd) {
    fs.mkdirSync(path.dirname(options.outputMd), { recursive: true });
    fs.writeFileSync(options.outputMd, toMarkdown(diff), 'utf8');
    console.log(`[avatar-audit-diff] wrote markdown: ${options.outputMd}`);
  }
};

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[avatar-audit-diff] FAILED: ${message}`);
  process.exit(1);
}
