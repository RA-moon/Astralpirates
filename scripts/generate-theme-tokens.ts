import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { cssVariableTokens, customMediaTokens, semanticTokenBlueprint } from '../shared/theme/tokens';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const frontendStylesDir = path.join(projectRoot, 'frontend', 'app', 'styles');
const cssPath = path.join(frontendStylesDir, 'tokens.css');
const tsPath = path.join(frontendStylesDir, 'tokens.ts');
const sharedThemeDir = path.join(projectRoot, 'shared', 'theme');
const sharedCssPath = path.join(sharedThemeDir, 'tokens.css');
const sharedRuntimePath = path.join(sharedThemeDir, 'runtime-tokens.ts');

const isCheckMode = process.argv.includes('--check');
const touchedFiles: string[] = [];
const tokenCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const buildCss = () => {
  const lines = Object.entries(cssVariableTokens)
    .sort(([a], [b]) => tokenCollator.compare(a, b))
    .map(([name, value]) => `  --${name}: ${value};`);

  const mediaLines = Object.entries(customMediaTokens)
    .sort(([a], [b]) => tokenCollator.compare(a, b))
    .map(([name, value]) => `@custom-media --${name} ${value};`);

  return `:root {\n${lines.join('\n')}\n}\n\n${mediaLines.join('\n')}`;
};

const buildRuntimeTokens = (blueprint: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(blueprint).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, `var(--${value})`];
      }
      if (value && typeof value === 'object') {
        return [key, buildRuntimeTokens(value as Record<string, unknown>)];
      }
      throw new Error(`Unsupported blueprint value for key "${key}"`);
    }),
  );
};

const runtimeTokens = buildRuntimeTokens(semanticTokenBlueprint as Record<string, unknown>);

const runtimeContent = `export const tokens = ${JSON.stringify(runtimeTokens, null, 2)} as const;\n\nexport type Tokens = typeof tokens;\n`;

const cssContent = buildCss();

const normalizeContent = (content: string) => (content.endsWith('\n') ? content : `${content}\n`);

const compareOrWrite = async (filePath: string, content: string) => {
  const normalized = normalizeContent(content);
  if (isCheckMode) {
    try {
      const current = await readFile(filePath, 'utf8');
      if (current !== normalized) {
        touchedFiles.push(filePath);
      }
    } catch {
      touchedFiles.push(filePath);
    }
    return;
  }

  await writeFile(filePath, normalized, 'utf8');
};

const run = async () => {
  await Promise.all([
    compareOrWrite(cssPath, cssContent),
    compareOrWrite(tsPath, runtimeContent),
    compareOrWrite(sharedCssPath, cssContent),
    compareOrWrite(sharedRuntimePath, runtimeContent),
  ]);

  if (isCheckMode && touchedFiles.length) {
    const relative = touchedFiles.map((file) => path.relative(projectRoot, file));
    throw new Error(`Design tokens are out of date. Run pnpm tokens:generate to refresh them (changed: ${relative.join(', ')}).`);
  }
};

run().catch((error) => {
  console.error('[design-system] Token generation failed:', error.message ?? error);
  process.exitCode = 1;
});
