#!/usr/bin/env node
import process from 'node:process';
import { applyReportCliArgs, findFirstPositionalArg } from './lib/report-cli-options.mjs';

const args = process.argv.slice(2);

const cliOptions = {
  originArg: '',
  crawlerUserAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  humanUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  warnOnly: false,
  blockedPath: '/bridge/',
  apiPath: '/api/pages/health',
};

const valueFlags = {
  '--origin': 'originArg',
  '--crawler-ua': 'crawlerUserAgent',
  '--human-ua': 'humanUserAgent',
  '--blocked-path': 'blockedPath',
  '--api-path': 'apiPath',
};

const booleanFlags = {
  '--warn-only': 'warnOnly',
};

const showHelp = () => {
  console.log(`Usage:
  node scripts/check-crawler-shield.mjs [options]

Options:
  --origin <url>           Origin to check (default: FRONTEND_ORIGIN or http://localhost:8080)
  --crawler-ua <value>     User-Agent used for crawler checks
  --human-ua <value>       User-Agent used for human checks
  --blocked-path <path>    Non-home path expected to be crawler-blocked (default: /bridge/)
  --api-path <path>        API path expected to be crawler-blocked (default: /api/pages/health)
  --warn-only              Print failures but exit 0
  -h, --help               Show this help
`);
};

const { helpRequested } = applyReportCliArgs({
  argv: args,
  options: cliOptions,
  valueFlags,
  booleanFlags,
});
if (helpRequested) {
  showHelp();
  process.exit(0);
}
if (!cliOptions.originArg) {
  cliOptions.originArg = findFirstPositionalArg({
    argv: args,
    valueFlags,
    booleanFlags,
  });
}

const origin = cliOptions.originArg || process.env.FRONTEND_ORIGIN || 'http://localhost:8080';
const failures = [];
const warnings = [];
const normalizedBlockedPath = cliOptions.blockedPath?.trim() ? cliOptions.blockedPath.trim() : '/bridge/';
const normalizedApiPath = cliOptions.apiPath?.trim() ? cliOptions.apiPath.trim() : '/api/pages/health';

const toUrl = (pathname) => new URL(pathname, origin).toString();

const fetchWithUa = async (pathname, userAgent) => {
  const url = toUrl(pathname);
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'user-agent': userAgent,
    },
  });
  const body = await response.text();
  return { url, response, body };
};

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

try {
  const [homeCrawler, blockedCrawler, apiCrawler, blockedHuman, robotsDoc, sitemapDoc] = await Promise.all([
    fetchWithUa('/', cliOptions.crawlerUserAgent),
    fetchWithUa(normalizedBlockedPath, cliOptions.crawlerUserAgent),
    fetchWithUa(normalizedApiPath, cliOptions.crawlerUserAgent),
    fetchWithUa(normalizedBlockedPath, cliOptions.humanUserAgent),
    fetchWithUa('/robots.txt', cliOptions.crawlerUserAgent),
    fetchWithUa('/sitemap.xml', cliOptions.crawlerUserAgent),
  ]);

  const homeStatus = homeCrawler.response.status;
  const blockedStatus = blockedCrawler.response.status;
  const apiStatus = apiCrawler.response.status;
  const humanBlockedStatus = blockedHuman.response.status;
  const expectedHomepageSitemapUrl = toUrl('/');

  assert(homeStatus !== 403, `[${homeCrawler.url}] crawler home request must not be 403.`);
  assert(blockedStatus === 403, `[${blockedCrawler.url}] crawler non-home request must be 403.`);
  assert(apiStatus === 403, `[${apiCrawler.url}] crawler API request must be 403.`);
  assert(humanBlockedStatus !== 403, `[${blockedHuman.url}] human request should not be 403.`);

  const homeRobotsHeader = homeCrawler.response.headers.get('x-robots-tag');
  if (!homeRobotsHeader) {
    warnings.push(`[${homeCrawler.url}] missing x-robots-tag header on home response.`);
  } else {
    const normalized = homeRobotsHeader.toLowerCase().replace(/\s+/g, '');
    assert(
      normalized.includes('index') && normalized.includes('nofollow'),
      `[${homeCrawler.url}] expected x-robots-tag to contain "index" and "nofollow"; got "${homeRobotsHeader}".`,
    );
  }

  const blockedRobotsHeader = blockedCrawler.response.headers.get('x-robots-tag');
  if (!blockedRobotsHeader) {
    warnings.push(`[${blockedCrawler.url}] missing x-robots-tag header on blocked response.`);
  } else {
    const normalized = blockedRobotsHeader.toLowerCase().replace(/\s+/g, '');
    assert(
      normalized.includes('noindex') && normalized.includes('nofollow'),
      `[${blockedCrawler.url}] expected blocked x-robots-tag to contain "noindex,nofollow"; got "${blockedRobotsHeader}".`,
    );
  }

  assert(
    robotsDoc.body.includes('Allow: /$'),
    `[${robotsDoc.url}] expected robots.txt to include "Allow: /$".`,
  );
  assert(
    robotsDoc.body.includes('Disallow: /'),
    `[${robotsDoc.url}] expected robots.txt to include "Disallow: /".`,
  );

  const urlMatches = sitemapDoc.body.match(/<url>/g) ?? [];
  assert(urlMatches.length === 1, `[${sitemapDoc.url}] expected exactly one <url> entry.`);
  assert(
    sitemapDoc.body.includes(`<loc>${expectedHomepageSitemapUrl}</loc>`),
    `[${sitemapDoc.url}] expected homepage loc <loc>${expectedHomepageSitemapUrl}</loc>.`,
  );
} catch (error) {
  failures.push(`Crawler shield check failed to complete: ${error instanceof Error ? error.message : String(error)}`);
}

if (warnings.length > 0) {
  console.warn('[check-crawler-shield] Warnings:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (failures.length > 0) {
  console.error('[check-crawler-shield] Failures:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  if (cliOptions.warnOnly) {
    console.warn('[check-crawler-shield] warn-only mode enabled; exiting without failure.');
    process.exit(0);
  }
  process.exit(1);
}

console.log('[check-crawler-shield] OK - crawler whitelist/block policy is active.');
