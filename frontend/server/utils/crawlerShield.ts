const knownCrawlerPatterns = [
  /googlebot/i,
  /bingbot/i,
  /duckduckbot/i,
  /yandex(bot)?/i,
  /baiduspider/i,
  /petalbot/i,
  /applebot/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /sogou/i,
  /bytespider/i,
  /gptbot/i,
  /chatgpt-user/i,
  /oai-searchbot/i,
  /claudebot/i,
  /anthropic-ai/i,
  /perplexitybot/i,
  /ccbot/i,
  /amazonbot/i,
];

const crawlerAllowlistedExactPaths = new Set([
  '/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/_payload.json',
]);

const crawlerAllowlistedPrefixes = ['/_nuxt/', '/.well-known/'];

export const normalizeCrawlerPath = (path: string | undefined) => {
  if (!path || path.trim().length === 0) return '/';
  const withoutQuery = path.split('?')[0] ?? '';
  const withoutFragment = withoutQuery.split('#')[0] ?? '';
  if (!withoutFragment || withoutFragment.length === 0) return '/';
  return withoutFragment.startsWith('/') ? withoutFragment : `/${withoutFragment}`;
};

export const isKnownCrawlerUserAgent = (userAgent: string | undefined | null) => {
  if (!userAgent) return false;
  return knownCrawlerPatterns.some((pattern) => pattern.test(userAgent));
};

export const isCrawlerPathAllowlisted = (path: string | undefined) => {
  const normalized = normalizeCrawlerPath(path);
  if (crawlerAllowlistedExactPaths.has(normalized)) return true;
  return crawlerAllowlistedPrefixes.some((prefix) => normalized.startsWith(prefix));
};

export const crawlerRobotsDirective = (path: string | undefined) => {
  const normalized = normalizeCrawlerPath(path);
  if (normalized === '/') {
    return 'index, nofollow';
  }
  return 'noindex, nofollow, noarchive, nosnippet, noimageindex';
};
