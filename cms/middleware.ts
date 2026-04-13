import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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

const isKnownCrawlerUserAgent = (userAgent: string | null) => {
  if (!userAgent) return false;
  return knownCrawlerPatterns.some((pattern) => pattern.test(userAgent));
};

const robotsDirectiveForPath = (path: string) => {
  if (path === '/') return 'index, nofollow';
  return 'noindex, nofollow, noarchive, nosnippet, noimageindex';
};

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const robotsDirective = robotsDirectiveForPath(path);
  const userAgent = request.headers.get('user-agent');
  const isCrawler = isKnownCrawlerUserAgent(userAgent);

  if (isCrawler && (path === '/api' || path.startsWith('/api/') || path.startsWith('/admin'))) {
    return new NextResponse('Crawler access forbidden.', {
      status: 403,
      headers: {
        'X-Robots-Tag': robotsDirective,
      },
    });
  }

  if (path === '/admin/') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    const response = NextResponse.rewrite(url);
    response.headers.set('X-Robots-Tag', robotsDirective);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', robotsDirective);
  return response;
}
