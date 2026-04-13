#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchNavigationOverrideMap } from '@astralpirates/shared/navigationNodes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const { loadDefaultEnvOrder } = await import('../config/loadEnv.ts');
const { resolveFrontendEnv } = await import('../config/envSchema.ts');

loadDefaultEnvOrder(projectRoot, path.join(projectRoot, 'frontend'));

const frontendEnv = resolveFrontendEnv();
const overrides = await fetchNavigationOverrideMap({
  baseUrl: frontendEnv.astralApiBase,
  onError: (error, { endpoint }) => {
    console.warn(`[navigation] Failed to fetch overrides from CMS (${endpoint}):`, error.message);
  },
});

const { siteMenuNodes } = await import('../frontend/app/components/site-menu/schema.ts');
const normaliseHref = (href) => {
  if (typeof href !== 'string') return '';
  const trimmed = href.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
};

const links = siteMenuNodes.map((node) => {
  const override = overrides?.get(node.id);
  const hrefSource = typeof override?.href === 'string' && override.href.trim().length ? override.href : node.href;
  return {
    label: override?.label ?? node.label,
    href: normaliseHref(hrefSource),
  };
});
const outputPath = path.join(projectRoot, 'frontend', 'public', 'navigation.json');

const toSitemapUrl = (href, origin) => {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (!trimmed.startsWith('/')) return null;
  try {
    return new URL(trimmed, origin).toString();
  } catch {
    return null;
  }
};

const buildSitemap = (origin) => {
  const homepage = toSitemapUrl('/', origin);
  const entries = homepage ? `  <url><loc>${homepage}</loc></url>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</urlset>\n`;
};

await writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), links }, null, 2));

const sitemapOriginSource = process.env.FRONTEND_ORIGIN?.trim() || 'https://astralpirates.com';
const origin = new URL(sitemapOriginSource).origin;
const sitemapPath = path.join(projectRoot, 'frontend', 'public', 'sitemap.xml');
await writeFile(sitemapPath, buildSitemap(origin));

console.log(`Navigation manifest written to ${outputPath}`);
console.log(`Sitemap written to ${sitemapPath}`);
