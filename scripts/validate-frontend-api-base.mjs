#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const argv = process.argv.slice(2);
let fileArg;
let sitemapFileArg;
let skipSitemap = false;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--file' && argv[i + 1]) {
    fileArg = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--file=')) {
    fileArg = arg.slice('--file='.length);
    continue;
  }
  if (arg === '--sitemap-file' && argv[i + 1]) {
    sitemapFileArg = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--sitemap-file=')) {
    sitemapFileArg = arg.slice('--sitemap-file='.length);
    continue;
  }
  if (arg === '--skip-sitemap') {
    skipSitemap = true;
    continue;
  }
}

const targetFile = path.resolve(repoRoot, fileArg ?? 'frontend/.output/public/200.html');
const sitemapFile = sitemapFileArg
  ? path.resolve(repoRoot, sitemapFileArg)
  : path.join(path.dirname(targetFile), 'sitemap.xml');

const fatal = (message) => {
  console.error(`[validate-frontend-api-base] ${message}`);
  process.exitCode = 1;
};

const normalise = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return value.replace(/\/+$/, '');
  }
};

const isAbsoluteHttp = (value) => /^https?:\/\//i.test(value);
const isLocalHost = (value) => {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const allowLocal = ['0', 'false', 'no'].includes(
  String(process.env.FRONTEND_VALIDATE_API_BASE ?? '').trim().toLowerCase(),
);

if (!fs.existsSync(targetFile)) {
  fatal(`Bundle file not found at ${targetFile}. Run 'pnpm --dir frontend generate' first.`);
  process.exit();
}

const html = fs.readFileSync(targetFile, 'utf8');
// Nuxt may emit the key with or without quotes depending on minifier; accept both.
const match = html.match(/astralApiBase["']?\s*:\s*"([^"]+)"/);

if (!match) {
  fatal('Could not locate astralApiBase in the generated bundle.');
  process.exit();
}

const bundleBase = match[1];
const bundleNormalised = normalise(bundleBase);

const envBases = ['ASTRAL_API_BASE', 'NUXT_PUBLIC_ASTRAL_API_BASE']
  .map((key) => [key, process.env[key]])
  .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
  .map(([key, value]) => [key, normalise(value.trim())]);

const uniqueEnvValues = Array.from(new Set(envBases.map(([, value]) => value)));
if (uniqueEnvValues.length > 1) {
  fatal(
    `ASTRAL_API_BASE and NUXT_PUBLIC_ASTRAL_API_BASE differ (${uniqueEnvValues.join(
      ' vs ',
    )}); align them before deploying.`,
  );
}

const expectedBase = uniqueEnvValues[0];
const expectedFrontendOrigin = (() => {
  const raw = process.env.FRONTEND_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin.replace(/\/+$/, '');
  } catch {
    fatal(`FRONTEND_ORIGIN is not a valid absolute URL: "${raw}".`);
    return null;
  }
})();
let sitemapLoc = null;

if (!isAbsoluteHttp(bundleBase)) {
  fatal(`astralApiBase must be an absolute URL, found "${bundleBase}".`);
}

if (!allowLocal && isLocalHost(bundleBase)) {
  fatal(
    `astralApiBase points to localhost (${bundleBase}). Set ASTRAL_API_BASE/NUXT_PUBLIC_ASTRAL_API_BASE to the public CMS origin before building.`,
  );
}

if (expectedBase && bundleNormalised !== expectedBase) {
  fatal(
    `Bundle astralApiBase (${bundleBase}) does not match environment (${expectedBase}). Rebuild with the correct env vars.`,
  );
}

if (!skipSitemap) {
  if (!fs.existsSync(sitemapFile)) {
    fatal(`Sitemap file not found at ${sitemapFile}. Run 'pnpm --dir frontend generate' first.`);
  } else {
    const sitemap = fs.readFileSync(sitemapFile, 'utf8');
    const locMatch = sitemap.match(/<loc>([^<]+)<\/loc>/i);
    if (!locMatch) {
      fatal(`Could not locate a <loc> entry in ${sitemapFile}.`);
    } else {
      sitemapLoc = locMatch[1].trim();
      if (!isAbsoluteHttp(sitemapLoc)) {
        fatal(`Sitemap <loc> must be an absolute URL, found "${sitemapLoc}".`);
      }
      if (!allowLocal && isLocalHost(sitemapLoc)) {
        fatal(
          `Sitemap <loc> points to localhost (${sitemapLoc}). Set FRONTEND_ORIGIN to the public frontend origin before building.`,
        );
      }
      if (expectedFrontendOrigin) {
        const expectedSitemapLoc = `${expectedFrontendOrigin}/`;
        if (sitemapLoc !== expectedSitemapLoc) {
          fatal(
            `Sitemap <loc> (${sitemapLoc}) does not match FRONTEND_ORIGIN (${expectedSitemapLoc}). Rebuild with the correct env vars.`,
          );
        }
      }
    }
  }
}

if (process.exitCode) {
  process.exit();
}

if (sitemapLoc) {
  console.log(`[validate-frontend-api-base] OK – ${bundleBase} | sitemap ${sitemapLoc}`);
} else {
  console.log(`[validate-frontend-api-base] OK – ${bundleBase}`);
}
