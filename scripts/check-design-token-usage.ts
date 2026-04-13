import { promises as fs } from 'node:fs';
import path from 'node:path';

import { cssVariableTokens } from '../shared/theme/tokens';

const REPO_ROOT = process.cwd();
const pathCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const SCAN_DIRS = [
  path.join(REPO_ROOT, 'frontend', 'app'),
  path.join(REPO_ROOT, 'frontend', 'server'),
  path.join(REPO_ROOT, 'cms', 'app'),
  path.join(REPO_ROOT, 'cms', 'src'),
] as const;

const SCAN_EXTENSIONS = new Set(['.vue', '.css', '.ts', '.tsx', '.js', '.jsx']);
const TOKEN_PREFIXES = [
  'color-',
  'gradient-',
  'layout-',
  'radius-',
  'shadow-',
  'space-',
  'font-',
  'animation-',
  'transition-',
  'icon-',
  'size-',
  'z-',
] as const;

const isTokenCandidate = (tokenName: string) => TOKEN_PREFIXES.some((prefix) => tokenName.startsWith(prefix));

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.nuxt', '.output', '.next', 'dist']);
const IGNORED_TOKEN_NAMES = new Set(['font-top-padding-local']);
const shouldIgnoreToken = (tokenName: string) => IGNORED_TOKEN_NAMES.has(tokenName) || tokenName.endsWith('-local');

type MissingToken = {
  filePath: string;
  lineNumber: number;
  token: string;
  line: string;
};

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }
  return files;
}

async function main() {
  const tokenNames = new Set(Object.keys(cssVariableTokens));
  const missing: MissingToken[] = [];

  const files = (
    await Promise.all(
      SCAN_DIRS.map(async (dir) => {
        try {
          return await collectFiles(dir);
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const varUsage = /var\(--([a-zA-Z0-9_-]+)/g;

  await Promise.all(
    files.map(async (filePath) => {
      const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split(/\r?\n/);
      lines.forEach((line, index) => {
        varUsage.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = varUsage.exec(line))) {
          const token = match[1];
          if (!isTokenCandidate(token)) continue;
          if (shouldIgnoreToken(token)) continue;
          if (tokenNames.has(token)) continue;
          missing.push({ filePath: relativePath, lineNumber: index + 1, token, line: line.trim() });
        }
      });
    }),
  );

  if (missing.length === 0) {
    return;
  }

  missing.sort((a, b) => {
    if (a.filePath === b.filePath) return a.lineNumber - b.lineNumber;
    return pathCollator.compare(a.filePath, b.filePath);
  });

  console.error('[design-system] Missing design tokens referenced in UI code:');
  for (const entry of missing) {
    console.error(`  - ${entry.filePath}:${entry.lineNumber} uses var(--${entry.token})`);
    console.error(`    ${entry.line}`);
  }
  console.error('');
  console.error('Fix by adding the token to shared/theme/tokens.ts (source of truth) and running `pnpm tokens:generate`.');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('[design-system] Token usage check failed:', error);
  process.exitCode = 1;
});
