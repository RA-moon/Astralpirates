import {
  crawlerRobotsDirective,
  isCrawlerPathAllowlisted,
  isKnownCrawlerUserAgent,
  normalizeCrawlerPath,
} from '../../server/utils/crawlerShield';

describe('crawlerShield utils', () => {
  it('normalizes crawler paths', () => {
    expect(normalizeCrawlerPath(undefined)).toBe('/');
    expect(normalizeCrawlerPath('')).toBe('/');
    expect(normalizeCrawlerPath('/bridge/logbook?x=1')).toBe('/bridge/logbook');
    expect(normalizeCrawlerPath('bridge/logbook#fragment')).toBe('/bridge/logbook');
  });

  it('detects known crawler user agents', () => {
    expect(isKnownCrawlerUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com/bot.html)')).toBe(true);
    expect(isKnownCrawlerUserAgent('Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)')).toBe(true);
    expect(isKnownCrawlerUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });

  it('allowlists only airlock + crawler essentials', () => {
    expect(isCrawlerPathAllowlisted('/')).toBe(true);
    expect(isCrawlerPathAllowlisted('/robots.txt')).toBe(true);
    expect(isCrawlerPathAllowlisted('/sitemap.xml')).toBe(true);
    expect(isCrawlerPathAllowlisted('/_nuxt/chunk.js')).toBe(true);
    expect(isCrawlerPathAllowlisted('/bridge')).toBe(false);
    expect(isCrawlerPathAllowlisted('/gangway')).toBe(false);
  });

  it('returns the expected robots directives', () => {
    expect(crawlerRobotsDirective('/')).toBe('index, nofollow');
    expect(crawlerRobotsDirective('/bridge')).toBe(
      'noindex, nofollow, noarchive, nosnippet, noimageindex',
    );
  });
});

