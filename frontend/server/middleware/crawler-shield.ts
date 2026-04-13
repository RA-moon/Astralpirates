import { createError, defineEventHandler, getRequestHeader, setResponseHeader } from 'h3';
import {
  crawlerRobotsDirective,
  isCrawlerPathAllowlisted,
  isKnownCrawlerUserAgent,
  normalizeCrawlerPath,
} from '../utils/crawlerShield';

const shouldBypass = (path: string) => {
  return path.startsWith('/__nuxt_devtools__');
};

export default defineEventHandler((event) => {
  const normalizedPath = normalizeCrawlerPath(event.path);
  if (shouldBypass(normalizedPath)) return;

  setResponseHeader(event, 'X-Robots-Tag', crawlerRobotsDirective(normalizedPath));

  const userAgent = getRequestHeader(event, 'user-agent') ?? '';
  if (!isKnownCrawlerUserAgent(userAgent)) return;

  if (normalizedPath === '/api' || normalizedPath.startsWith('/api/')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Crawler access forbidden for API routes.',
    });
  }

  if (isCrawlerPathAllowlisted(normalizedPath)) return;

  throw createError({
    statusCode: 403,
    statusMessage: 'Crawler access forbidden outside Airlock.',
  });
});
