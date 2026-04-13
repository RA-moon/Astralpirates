import type { H3Event } from 'h3';
import { setHeader } from 'h3';
import { useNitroApp, useRuntimeConfig } from '#imports';
import { hasCmsAuth, resolveCmsAuthHeaders } from './cms-auth';

export type CmsLogger = {
  warn: (...args: any[]) => void;
};

export const resolveAstralApiBase = () => {
  const config = useRuntimeConfig();
  return String(config.astralApiBase ?? config.public?.astralApiBase ?? '').trim();
};

export const resolveCmsBaseUrl = resolveAstralApiBase;

export const applyCacheControl = (event: H3Event, cacheControl: string) => {
  setHeader(event, 'Cache-Control', cacheControl);
};

export const withCmsAuthCachedResponse = async <T>({
  event,
  cacheControl,
  hasAuth,
  onAuthorized,
  onUnauthorized,
}: {
  event: H3Event;
  cacheControl: string;
  hasAuth: boolean;
  onAuthorized: () => Promise<T>;
  onUnauthorized: () => T;
}): Promise<T> => {
  if (!hasAuth) {
    applyCacheControl(event, cacheControl);
    event.node.res.statusCode = 401;
    return onUnauthorized();
  }

  const result = await onAuthorized();
  applyCacheControl(event, cacheControl);
  return result;
};

export const runCmsCachedRoute = async <T>({
  event,
  cacheControl,
  cachedHandler,
  onUnauthorized,
}: {
  event: H3Event;
  cacheControl: string;
  cachedHandler: (event: H3Event) => Promise<T>;
  onUnauthorized: () => T;
}) => {
  return withCmsAuthCachedResponse({
    event,
    cacheControl,
    hasAuth: hasCmsAuth(event),
    onAuthorized: async () => cachedHandler(event),
    onUnauthorized,
  });
};

type CmsFetcher<T> = (options: {
  baseUrl: string;
  onError: (error: Error, context: { endpoint: string }) => void;
}) => Promise<T | null>;

export const loadFromCms = async <T>({
  baseUrl,
  fetcher,
  logger,
  missingConfigMessage,
  errorLogMessage,
}: {
  baseUrl: string;
  fetcher: CmsFetcher<T>;
  logger: CmsLogger;
  missingConfigMessage: string;
  errorLogMessage: string;
}): Promise<T | null> => {
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedBaseUrl) {
    logger.warn(missingConfigMessage);
    return null;
  }

  return fetcher({
    baseUrl: trimmedBaseUrl,
    onError: (error, context) => {
      logger.warn({ err: error, endpoint: context.endpoint }, errorLogMessage);
    },
  });
};

export const markFallback = (
  event: H3Event,
  headerName: string,
  value: string,
  logger?: CmsLogger,
  logMessage?: string,
) => {
  setHeader(event, headerName, value);
  if (logger && logMessage) {
    logger.warn(logMessage);
  }
};

export const resolveCmsRouteContext = (event: H3Event): {
  baseUrl: string;
  logger: CmsLogger;
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} => {
  const { logger } = useNitroApp() as { logger?: CmsLogger };
  const cmsLogger = logger ?? console;
  const baseUrl = resolveAstralApiBase();
  const authHeaders = resolveCmsAuthHeaders(event);
  const fetchWithAuth = (input: RequestInfo | URL, init: RequestInit = {}) =>
    globalThis.fetch(input, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...authHeaders,
      },
    });
  return { baseUrl, logger: cmsLogger, fetchWithAuth };
};
