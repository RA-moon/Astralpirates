#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

const { siteMenuLayout, siteMenuNodes } = await import('../../frontend/app/components/site-menu/schema.ts');

const layoutById = new Map(siteMenuLayout.map((entry) => [entry.id, entry]));

const rows = siteMenuNodes.map((node) => {
  const layout = layoutById.get(node.id);
  return `| ${node.id} | ${node.label} | ${node.href} | ${layout?.area ?? ''} | ${layout?.position ?? ''} | ${layout?.level ?? 'primary'} |`;
});

const buildTable = (timestamp) =>
  [
    '# Navigation Schema',
    '',
    'Auto-generated from `frontend/app/components/site-menu/schema.ts`.',
    '',
    '| Node ID | Label | Route | Area | Position | Level |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Generated at ${timestamp}`,
  ].join('\n');

const outputPath = path.join(projectRoot, 'docs', 'navigation.md');
const timestampLinePattern = /^Generated at .+$/m;

const normalizeForCompare = (value) => value.replace(timestampLinePattern, 'Generated at <timestamp>').trim();
const parseGeneratedAt = (value) => {
  const match = value.match(/^Generated at (.+)$/m);
  return match ? match[1].trim() : null;
};

if (checkMode) {
  const existing = await readFile(outputPath, 'utf8');
  const expected = buildTable(new Date().toISOString());

  if (normalizeForCompare(existing) !== normalizeForCompare(expected)) {
    console.error('docs/navigation.md is out of sync with the site-menu schema. Run: pnpm exec tsx scripts/tools/generate-navigation-docs.mjs');
    process.exitCode = 1;
  } else {
    const generatedAt = parseGeneratedAt(existing);
    if (!generatedAt) {
      console.error('docs/navigation.md is missing a "Generated at <ISO timestamp>" line.');
      process.exitCode = 1;
    } else {
      const generatedAtMs = Date.parse(generatedAt);
      if (Number.isNaN(generatedAtMs)) {
        console.error(`docs/navigation.md has an invalid generated timestamp: ${generatedAt}`);
        process.exitCode = 1;
      }
    }
  }

  if (!process.exitCode) {
    console.log('Navigation docs are in sync.');
  }
} else {
  const table = buildTable(new Date().toISOString());
  await writeFile(outputPath, table, 'utf8');
  console.log(`Navigation docs written to ${outputPath}`);
}
