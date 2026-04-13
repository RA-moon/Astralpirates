import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, 'check-frontend-chunk-budgets.mjs');

const createTempRoot = async () => mkdtemp(path.join(tmpdir(), 'chunk-budgets-test-'));

const writeChunk = async (chunksDir, fileName, sizeBytes) => {
  await writeFile(path.join(chunksDir, fileName), 'x'.repeat(sizeBytes));
};

const runChecker = ({ cwd, chunksDirRel, manifestRel, extraArgs = [] }) =>
  spawnSync(
    process.execPath,
    [
      scriptPath,
      '--dir',
      chunksDirRel,
      '--manifest',
      manifestRel,
      '--max-bytes',
      '100',
      '--background-max-bytes',
      '300',
      ...extraArgs,
    ],
    {
      cwd,
      encoding: 'utf8',
    },
  );

test('fails when manifest file is missing', async (t) => {
  const root = await createTempRoot();
  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const chunksDir = path.join(root, 'dist', '_nuxt');
  await mkdir(chunksDir, { recursive: true });
  await writeChunk(chunksDir, 'entry.js', 50);

  const run = runChecker({
    cwd: root,
    chunksDirRel: path.join('dist', '_nuxt'),
    manifestRel: path.join('dist', '_nuxt', 'chunk-metadata.json'),
  });

  const combined = `${run.stdout}\n${run.stderr}`;
  assert.notEqual(run.status, 0);
  assert.match(combined, /Unable to read chunk metadata manifest/i);
});

test('fails when manifest chunk basename mapping is ambiguous', async (t) => {
  const root = await createTempRoot();
  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const chunksDir = path.join(root, 'dist', '_nuxt');
  await mkdir(chunksDir, { recursive: true });
  await writeChunk(chunksDir, 'dup.js', 150);

  const manifestPath = path.join(chunksDir, 'chunk-metadata.json');
  const manifest = {
    chunks: {
      '_nuxt/dup.js': {
        dynamicImports: [],
        imports: [],
        isDynamicEntry: false,
        isEntry: true,
        modules: ['/app/background/scene.ts'],
        tags: ['background-source'],
      },
      'nested/dup.js': {
        dynamicImports: [],
        imports: [],
        isDynamicEntry: false,
        isEntry: false,
        modules: [],
        tags: [],
      },
    },
    generatedAt: '2026-04-08T00:00:00.000Z',
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const run = runChecker({
    cwd: root,
    chunksDirRel: path.join('dist', '_nuxt'),
    manifestRel: path.join('dist', '_nuxt', 'chunk-metadata.json'),
  });

  const combined = `${run.stdout}\n${run.stderr}`;
  assert.notEqual(run.status, 0);
  assert.match(combined, /Ambiguous manifest mapping for chunk "dup\.js"/i);
});

test('treats static import closure from background-tagged roots as background overage', async (t) => {
  const root = await createTempRoot();
  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const chunksDir = path.join(root, 'dist', '_nuxt');
  await mkdir(chunksDir, { recursive: true });
  await writeChunk(chunksDir, 'entry.js', 60);
  await writeChunk(chunksDir, 'shared-large.js', 220);
  await writeChunk(chunksDir, 'neutral.js', 40);

  const manifestPath = path.join(chunksDir, 'chunk-metadata.json');
  const manifest = {
    chunks: {
      '_nuxt/entry.js': {
        dynamicImports: [],
        imports: ['_nuxt/shared-large.js'],
        isDynamicEntry: true,
        isEntry: true,
        modules: ['/app/background/scene.ts'],
        tags: ['background-source'],
      },
      '_nuxt/shared-large.js': {
        dynamicImports: [],
        imports: [],
        isDynamicEntry: false,
        isEntry: false,
        modules: ['/app/composables/useBackground.ts'],
        tags: [],
      },
      '_nuxt/neutral.js': {
        dynamicImports: [],
        imports: [],
        isDynamicEntry: false,
        isEntry: false,
        modules: ['/app/components/Plain.vue'],
        tags: [],
      },
    },
    generatedAt: '2026-04-08T00:00:00.000Z',
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const run = runChecker({
    cwd: root,
    chunksDirRel: path.join('dist', '_nuxt'),
    manifestRel: path.join('dist', '_nuxt', 'chunk-metadata.json'),
  });

  const combined = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, combined);
  assert.match(combined, /\[chunk-budgets\] OK/);
  assert.match(combined, /background-overages-within-exception/i);
  assert.match(combined, /shared-large\.js/);
});
