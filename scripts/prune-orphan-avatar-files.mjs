#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_AVATARS_ROOT = path.resolve(process.cwd(), 'cms/public/media/avatars');
const DEFAULT_MAX_DELETE = 500;

const usage = () => {
  console.log(`Usage: node scripts/prune-orphan-avatar-files.mjs [options]

Prunes local orphan avatar files using avatar storage audit output.
Dry-run by default.

Options:
  --audit-json <path>       Avatar storage audit JSON path (required)
  --avatars-root <path>     Avatar local root (default: ${DEFAULT_AVATARS_ROOT})
  --output-json <path>      Optional prune report JSON output path
  --max-delete <n>          Safety cap for apply mode (default: ${DEFAULT_MAX_DELETE})
  --apply                   Delete files (dry-run when omitted)
  -h, --help                Show help
`);
};

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const asPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeRelative = (value) => {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized) return '';
  const safe = path.posix.normalize(normalized);
  if (!safe || safe === '.' || safe === '..' || safe.startsWith('../') || safe.includes('/../')) {
    return '';
  }
  return safe;
};

const ensureInsideRoot = (root, candidate) => {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  );
};

const removeEmptyParents = ({ root, from }) => {
  let current = path.dirname(from);
  const resolvedRoot = path.resolve(root);

  while (ensureInsideRoot(resolvedRoot, current) && current !== resolvedRoot) {
    let entries = [];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let auditJson = '';
  let avatarsRoot = DEFAULT_AVATARS_ROOT;
  let outputJson = '';
  let maxDelete = DEFAULT_MAX_DELETE;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--audit-json' && typeof next === 'string') {
      auditJson = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--avatars-root' && typeof next === 'string') {
      avatarsRoot = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--output-json' && typeof next === 'string') {
      outputJson = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (arg === '--max-delete' && typeof next === 'string') {
      maxDelete = asPositiveInt(next, DEFAULT_MAX_DELETE);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!auditJson) {
    throw new Error('--audit-json is required.');
  }

  return {
    auditJson,
    avatarsRoot,
    outputJson: outputJson || null,
    maxDelete,
    apply,
  };
};

const run = () => {
  const options = parseArgs();

  const raw = fs.readFileSync(options.auditJson, 'utf8');
  const payload = JSON.parse(raw);
  const orphanRows = Array.isArray(payload?.orphanFiles) ? payload.orphanFiles : [];

  const candidates = [];
  for (const row of orphanRows) {
    const relative = normalizeRelative(trim(row?.filename));
    if (!relative) continue;

    const absolute = path.resolve(options.avatarsRoot, relative);
    if (!ensureInsideRoot(options.avatarsRoot, absolute)) continue;

    const exists = fs.existsSync(absolute);
    candidates.push({
      filename: relative,
      absolutePath: absolute,
      exists,
    });
  }

  const existing = candidates.filter((entry) => entry.exists);
  const capped = existing.slice(0, options.maxDelete);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    avatarsRoot: options.avatarsRoot,
    auditJson: options.auditJson,
    maxDelete: options.maxDelete,
    totals: {
      orphanRows: orphanRows.length,
      validCandidates: candidates.length,
      existingCandidates: existing.length,
      selectedForDelete: capped.length,
      skippedBySafetyCap: Math.max(existing.length - capped.length, 0),
    },
    deleted: [],
    kept: existing.slice(capped.length).map((entry) => entry.filename),
  };

  if (options.apply) {
    if (existing.length > options.maxDelete) {
      throw new Error(
        `Refusing to delete ${existing.length} files (> max-delete=${options.maxDelete}).`,
      );
    }

    for (const entry of capped) {
      try {
        fs.unlinkSync(entry.absolutePath);
        removeEmptyParents({
          root: options.avatarsRoot,
          from: entry.absolutePath,
        });
        report.deleted.push(entry.filename);
      } catch (error) {
        throw new Error(
          `Failed to delete ${entry.filename}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  console.log(`[avatar-prune] mode=${report.mode}`);
  console.log(`[avatar-prune] root=${report.avatarsRoot}`);
  console.log(`[avatar-prune] existingCandidates=${report.totals.existingCandidates}`);
  if (options.apply) {
    console.log(`[avatar-prune] deleted=${report.deleted.length}`);
  } else {
    console.log('[avatar-prune] dry-run (pass --apply to delete)');
    for (const entry of capped.slice(0, 50)) {
      console.log(`  - ${entry.filename}`);
    }
  }

  if (options.outputJson) {
    fs.mkdirSync(path.dirname(options.outputJson), { recursive: true });
    fs.writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[avatar-prune] wrote report: ${options.outputJson}`);
  }
};

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[avatar-prune] FAILED: ${message}`);
  process.exit(1);
}
