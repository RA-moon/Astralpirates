import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..', '..', 'app');

const ALLOWED_WHERE_FILES = new Set([
  path.normalize('composables/usePageContent.ts'),
  path.normalize('pages/gangway/engineering/control/plans/[slug].vue'),
]);

const ALLOWED_ENDPOINT_MARKERS = ['/api/pages', '/api/plans'];

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|vue)$/.test(entry.name)) continue;
    files.push(fullPath);
  }

  return files;
};

describe('where[] query usage contract', () => {
  it('only uses where[] query keys on payload passthrough endpoints', () => {
    const offenders: string[] = [];
    const files = collectSourceFiles(APP_ROOT);

    for (const fullPath of files) {
      if (!statSync(fullPath).isFile()) continue;
      const source = readFileSync(fullPath, 'utf8');
      if (!/where\[[^\]]+\]/.test(source)) continue;

      const relativePath = path.normalize(path.relative(APP_ROOT, fullPath));
      if (!ALLOWED_WHERE_FILES.has(relativePath)) {
        offenders.push(`${relativePath}: where[] usage is not allowlisted`);
        continue;
      }

      const hasAllowedEndpoint = ALLOWED_ENDPOINT_MARKERS.some((marker) => source.includes(marker));
      if (!hasAllowedEndpoint) {
        offenders.push(`${relativePath}: allowlisted where[] usage must target /api/pages or /api/plans`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
