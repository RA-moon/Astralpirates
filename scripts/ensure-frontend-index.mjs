#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const argv = process.argv.slice(2);
let outputDirArg;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--dir' && argv[i + 1]) {
    outputDirArg = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--dir=')) {
    outputDirArg = arg.slice('--dir='.length);
    continue;
  }
}

const outputDir = path.resolve(repoRoot, outputDirArg ?? 'frontend/.output/public');
const srcPath = path.join(outputDir, '200.html');
const destPath = path.join(outputDir, 'index.html');
const payloadPath = path.join(outputDir, '_payload.json');
const pagesRoot = path.join(repoRoot, 'frontend', 'app', 'pages');
const manualFallbackRoutePaths = [
  'bridge',
  'gangway',
  'design-system',
  'enlist',
  'flight-plans',
  'logbook',
];

const collectPageFiles = (dir, prefix = '') => {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output') {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectPageFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile() && relativePath.endsWith('.vue')) {
      files.push(relativePath);
    }
  }

  return files;
};

const toFallbackRoutePath = (relativePagePath) => {
  const withoutExt = relativePagePath.slice(0, -'.vue'.length);
  const rawSegments = withoutExt.split(path.sep).filter(Boolean);
  if (rawSegments.length === 0) return null;

  const routeSegments = [];
  for (let index = 0; index < rawSegments.length; index += 1) {
    const segment = rawSegments[index];
    if (/^\[.+\]$/.test(segment)) {
      break;
    }

    const isLast = index === rawSegments.length - 1;
    if (isLast && segment === 'index') {
      continue;
    }

    routeSegments.push(segment);
  }

  return routeSegments.length > 0 ? routeSegments.join('/') : null;
};

const discoveredFallbackRoutePaths = collectPageFiles(pagesRoot)
  .map((file) => toFallbackRoutePath(file))
  .filter((routePath) => Boolean(routePath));

const fallbackRoutePaths = Array.from(
  new Set([...manualFallbackRoutePaths, ...discoveredFallbackRoutePaths]),
).sort((a, b) => a.localeCompare(b));

const fail = (message) => {
  console.error(`[ensure-frontend-index] ${message}`);
  process.exitCode = 1;
};

const writeFileIfChanged = (targetPath, buffer) => {
  const hasTarget = fs.existsSync(targetPath);
  const current = hasTarget ? fs.readFileSync(targetPath) : null;
  if (!hasTarget || !current?.equals(buffer)) {
    fs.writeFileSync(targetPath, buffer);
    return true;
  }
  return false;
};

if (!fs.existsSync(outputDir)) {
  fail(`Output directory not found at ${outputDir}. Run 'pnpm --dir frontend generate' first.`);
  process.exit();
}

const has200 = fs.existsSync(srcPath);
const hasIndex = fs.existsSync(destPath);

if (!has200 && !hasIndex) {
  fail(`Missing both 200.html and index.html in ${outputDir}; the static export did not complete.`);
  process.exit();
}

const extractFallbackShell = (html) => {
  const headMatch = html.match(/^[\s\S]*?<\/head>/i);
  if (!headMatch) return null;
  const bodyMatch = html.match(/<body[^>]*>/i);
  const bodyOpenTag = bodyMatch?.[0] ?? '<body>';

  const nuxtConfigScriptMatch = html.match(
    /<script>\s*window\.__NUXT__=\{\};window\.__NUXT__\.config=[\s\S]*?<\/script>/i,
  );
  if (!nuxtConfigScriptMatch) return null;

  const hydrationFlagScriptMatch = html.match(
    /<script[^>]*data-hid="astral-hydration-flag"[^>]*>[\s\S]*?<\/script>/i,
  );

  const headWithoutPayloadPreload = headMatch[0].replace(
    /<link rel="preload" as="fetch"[^>]*href="\/_payload[^>]*>/gi,
    '',
  );

  const fallbackHtml =
    `${headWithoutPayloadPreload}` +
    `${bodyOpenTag}` +
    '<div id="__nuxt"></div><div id="teleports"></div>' +
    nuxtConfigScriptMatch[0] +
    (hydrationFlagScriptMatch?.[0] ?? '') +
    '</body></html>';

  return fallbackHtml;
};

try {
  if (!has200 && hasIndex) {
    fs.copyFileSync(destPath, srcPath);
    console.log('[ensure-frontend-index] Created 200.html from index.html.');
  }
  const sourcePath = fs.existsSync(srcPath) ? srcPath : destPath;
  const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
  const fallbackShell = extractFallbackShell(sourceHtml);
  if (!fallbackShell) {
    fail(
      `Unable to derive a fallback shell from ${sourcePath}; expected </head>, Nuxt runtime config script, and body markup.`,
    );
    process.exit();
  }

  const fallbackBuffer = Buffer.from(fallbackShell, 'utf8');
  const payloadBuffer = Buffer.from('{}\n', 'utf8');

  const writeFallback = (targetPath) => writeFileIfChanged(targetPath, fallbackBuffer);

  const wrote200 = writeFallback(srcPath);
  const wroteIndex = writeFallback(destPath);
  const wrotePayload = writeFileIfChanged(payloadPath, payloadBuffer);
  const wroteRouteFallbacks = fallbackRoutePaths.reduce((count, routePath) => {
    const routeDir = path.join(outputDir, routePath);
    const routeIndexPath = path.join(routeDir, 'index.html');
    if (fs.existsSync(routeIndexPath)) {
      return count;
    }
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(routeIndexPath, fallbackBuffer);
    return count + 1;
  }, 0);

  if (wrote200 || wroteIndex || wrotePayload || wroteRouteFallbacks > 0) {
    console.log(
      `[ensure-frontend-index] Wrote neutral SPA fallback shell to ${path.basename(
        srcPath,
      )} and ${path.basename(destPath)} in ${outputDir}.`,
    );
    if (wrotePayload) {
      console.log('[ensure-frontend-index] Wrote _payload.json fallback stub.');
    }
    if (wroteRouteFallbacks > 0) {
      console.log(
        `[ensure-frontend-index] Seeded ${wroteRouteFallbacks} route fallback shell(s) for deep-link reload resilience.`,
      );
    }
  } else {
    console.log(
      '[ensure-frontend-index] index.html, 200.html, _payload.json, and route fallback shells already contain the fallback shell.',
    );
  }
} catch (err) {
  fail(`Failed to ensure index.html: ${err instanceof Error ? err.message : String(err)}`);
}
