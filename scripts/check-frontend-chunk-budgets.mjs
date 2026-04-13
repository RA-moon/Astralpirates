#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CHUNKS_DIR = path.resolve('frontend/.output/public/_nuxt');
const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_CHUNKS_DIR, 'chunk-metadata.json');
const DEFAULT_MAX_BYTES = 500 * 1024;
const DEFAULT_BACKGROUND_MAX_BYTES = 750 * 1024;
const DEFAULT_BACKGROUND_OVERAGE_LIMIT = 1;
const BACKGROUND_TAGS = new Set(['background-source', 'background-vendor']);

function printHelp() {
  console.log(`Usage: node scripts/check-frontend-chunk-budgets.mjs [options]

Checks generated frontend JS chunk sizes against enforced budgets.

Options:
  --dir <path>                          Chunk directory (default: ${DEFAULT_CHUNKS_DIR})
  --manifest <path>                     Chunk metadata manifest path (default: ${DEFAULT_MANIFEST_PATH})
  --max-bytes <n>                       Max bytes for general JS chunks (default: ${DEFAULT_MAX_BYTES})
  --background-max-bytes <n>            Max bytes for background 3D chunk(s) (default: ${DEFAULT_BACKGROUND_MAX_BYTES})
  --background-overage-limit <n>        How many background-marker chunks may exceed --max-bytes (default: ${DEFAULT_BACKGROUND_OVERAGE_LIMIT})
  -h, --help                            Show help
`);
}

function parseNonNegativeInt(value, flagName) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flagName} must be a non-negative integer. Received: ${value}`);
  }
  return Number.parseInt(value, 10);
}

function parseArgs(argv) {
  const options = {
    dir: DEFAULT_CHUNKS_DIR,
    manifest: DEFAULT_MANIFEST_PATH,
    maxBytes: DEFAULT_MAX_BYTES,
    backgroundMaxBytes: DEFAULT_BACKGROUND_MAX_BYTES,
    backgroundOverageLimit: DEFAULT_BACKGROUND_OVERAGE_LIMIT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('--dir requires a value');
      options.dir = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === '--manifest') {
      const next = argv[i + 1];
      if (!next) throw new Error('--manifest requires a value');
      options.manifest = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === '--max-bytes') {
      const next = argv[i + 1];
      if (!next) throw new Error('--max-bytes requires a value');
      options.maxBytes = parseNonNegativeInt(next, '--max-bytes');
      i += 1;
      continue;
    }
    if (arg === '--background-max-bytes') {
      const next = argv[i + 1];
      if (!next) throw new Error('--background-max-bytes requires a value');
      options.backgroundMaxBytes = parseNonNegativeInt(next, '--background-max-bytes');
      i += 1;
      continue;
    }
    if (arg === '--background-overage-limit') {
      const next = argv[i + 1];
      if (!next) throw new Error('--background-overage-limit requires a value');
      options.backgroundOverageLimit = parseNonNegativeInt(next, '--background-overage-limit');
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.backgroundMaxBytes < options.maxBytes) {
    throw new Error('--background-max-bytes must be >= --max-bytes');
  }

  return options;
}

async function listChunkFiles(chunksDir) {
  const entries = await fs.readdir(chunksDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.js.map'))
    .map((entry) => path.join(chunksDir, entry.name))
    .sort();
}

async function loadChunkManifest(manifestPath) {
  let parsed;
  try {
    const source = await fs.readFile(manifestPath, 'utf8');
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Unable to read chunk metadata manifest "${manifestPath}": ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.chunks || typeof parsed.chunks !== 'object') {
    throw new Error(`Invalid chunk metadata manifest format in "${manifestPath}".`);
  }

  return parsed;
}

function collectBackgroundChunks(manifest) {
  const queue = [];
  const visited = new Set();
  const normalized = new Set();
  const chunks = manifest.chunks;

  for (const [fileName, metadata] of Object.entries(chunks)) {
    if (!metadata || typeof metadata !== 'object') continue;
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    if (tags.some((tag) => BACKGROUND_TAGS.has(tag))) {
      queue.push(fileName);
    }
  }

  while (queue.length > 0) {
    const fileName = queue.pop();
    if (!fileName || visited.has(fileName)) continue;
    visited.add(fileName);
    normalized.add(path.basename(fileName));
    const metadata = chunks[fileName];
    if (!metadata || typeof metadata !== 'object') continue;
    const imports = Array.isArray(metadata.imports) ? metadata.imports : [];
    for (const dependency of imports) {
      if (typeof dependency === 'string' && chunks[dependency]) {
        queue.push(dependency);
      }
    }
  }

  return normalized;
}

function buildManifestChunkIndex(manifest) {
  const byBaseName = new Map();
  for (const [chunkKey, chunkMetadata] of Object.entries(manifest.chunks)) {
    const baseName = path.basename(chunkKey);
    const existing = byBaseName.get(baseName);
    if (existing && existing.key !== chunkKey) {
      throw new Error(
        `Ambiguous manifest mapping for chunk "${baseName}" (${existing.key} and ${chunkKey}).`,
      );
    }
    byBaseName.set(baseName, {
      key: chunkKey,
      metadata: chunkMetadata,
    });
  }
  return byBaseName;
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  let chunkPaths;
  try {
    chunkPaths = await listChunkFiles(options.dir);
  } catch (error) {
    throw new Error(`Unable to read chunk directory "${options.dir}": ${error.message}`);
  }
  const manifest = await loadChunkManifest(options.manifest);
  const backgroundChunks = collectBackgroundChunks(manifest);
  const manifestChunkIndex = buildManifestChunkIndex(manifest);

  if (chunkPaths.length === 0) {
    throw new Error(`No JS chunks found in "${options.dir}". Build frontend before running this check.`);
  }

  const hardFailures = [];
  const backgroundOverages = [];
  const topBySize = [];

  for (const filePath of chunkPaths) {
    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);
    const chunk = { bytes: stats.size, fileName, filePath };
    topBySize.push(chunk);

    if (stats.size <= options.maxBytes) continue;

    const manifestEntry = manifestChunkIndex.get(fileName)?.metadata;
    const backgroundChunk = backgroundChunks.has(fileName);
    if (!manifestEntry) {
      hardFailures.push({
        reason: 'missing-manifest-entry',
        ...chunk,
      });
      continue;
    }
    if (!backgroundChunk) {
      hardFailures.push({
        reason: 'general-budget-exceeded',
        ...chunk,
      });
      continue;
    }

    if (stats.size > options.backgroundMaxBytes) {
      hardFailures.push({
        reason: 'background-budget-exceeded',
        ...chunk,
      });
      continue;
    }

    backgroundOverages.push(chunk);
  }

  if (backgroundOverages.length > options.backgroundOverageLimit) {
    hardFailures.push(
      ...backgroundOverages.map((chunk) => ({
        reason: `background-overage-limit-exceeded(limit=${options.backgroundOverageLimit})`,
        ...chunk,
      })),
    );
  }

  topBySize.sort((a, b) => b.bytes - a.bytes);
  console.log(
    `[chunk-budgets] scanned=${chunkPaths.length} mapped=${Object.keys(manifest.chunks).length} backgroundTagged=${backgroundChunks.size} maxBytes=${options.maxBytes} backgroundMaxBytes=${options.backgroundMaxBytes}`,
  );
  console.log('[chunk-budgets] largest chunks:');
  for (const chunk of topBySize.slice(0, 5)) {
    console.log(`  - ${chunk.fileName}: ${formatSize(chunk.bytes)}`);
  }

  if (backgroundOverages.length > 0) {
    console.log('[chunk-budgets] background-overages-within-exception:');
    for (const chunk of backgroundOverages) {
      console.log(`  - ${chunk.fileName}: ${formatSize(chunk.bytes)}`);
    }
  }

  if (hardFailures.length > 0) {
    console.error('[chunk-budgets] FAILED');
    for (const failure of hardFailures) {
      console.error(`  - ${failure.reason}: ${failure.fileName} (${formatSize(failure.bytes)})`);
    }
    process.exit(1);
  }

  console.log('[chunk-budgets] OK');
}

await main().catch((error) => {
  console.error(`[chunk-budgets] FAILED: ${error.message}`);
  process.exit(1);
});
