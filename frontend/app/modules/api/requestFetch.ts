import type { $Fetch } from 'ofetch';
import { useRequestFetch, useRuntimeConfig } from '#app';
import { ofetch } from 'ofetch';

type Fetcher = $Fetch;

const normaliseOrigin = (value: string): string => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.replace(/\/+$/, '');
  }
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isLocalHostname = (value: string): boolean =>
  ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(value.toLowerCase());
const isSingleLabelHostname = (value: string): boolean => value.length > 0 && !value.includes('.');
const safeHostname = (value: string | undefined): string | null => {
  if (!value || !isAbsoluteUrl(value)) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};
const formatBase = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  if (isAbsoluteUrl(value)) {
    return normaliseOrigin(value);
  }
  const trimmed = value.replace(/\/+$/, '');
  if (!trimmed.length) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const resolveBrowserOrigin = (): string | undefined => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
};

const remapDockerServiceHostToBrowser = (
  formattedBase: string,
  browserOrigin: string,
): string | null => {
  if (!isAbsoluteUrl(formattedBase) || !isAbsoluteUrl(browserOrigin)) return null;
  try {
    const targetUrl = new URL(formattedBase);
    const browserUrl = new URL(browserOrigin);
    const targetHost = targetUrl.hostname.toLowerCase();
    const browserHost = browserUrl.hostname.toLowerCase();

    // When the browser already runs on a docker-network hostname (for example
    // Playwright hitting http://frontend:3001), service aliases like "cms" are
    // resolvable. Rewriting to the browser host would create invalid targets
    // such as http://frontend:3000.
    if (isSingleLabelHostname(browserHost) && !isLocalHostname(browserHost)) {
      return null;
    }

    // In local Docker dev, frontend code may receive "http://cms:3000" which is
    // resolvable only inside containers, not from the browser. Remap those
    // service-host URLs to the host currently serving the frontend app.
    if (isSingleLabelHostname(targetHost) && !isLocalHostname(targetHost)) {
      targetUrl.hostname = browserUrl.hostname;
      return `${targetUrl.protocol}//${targetUrl.host}`;
    }
  } catch {
    return null;
  }

  return null;
};

export const resolveAstralApiBase = () => {
  const config = useRuntimeConfig();
  const candidate = import.meta.server ? config.astralApiBase : config.public.astralApiBase;
  const formatted = formatBase(candidate);
  const browserOrigin = import.meta.server ? undefined : formatBase(resolveBrowserOrigin());
  const originHost = browserOrigin ? safeHostname(browserOrigin) : null;
  const targetHost = formatted ? safeHostname(formatted) : null;

  if (
    formatted &&
    !import.meta.server &&
    browserOrigin &&
    isAbsoluteUrl(formatted) &&
    originHost &&
    !isLocalHostname(originHost)
  ) {
    if (targetHost && isLocalHostname(targetHost)) {
      return browserOrigin;
    }
  }

  if (formatted && !import.meta.server && browserOrigin) {
    const remapped = remapDockerServiceHostToBrowser(formatted, browserOrigin);
    if (remapped) return remapped;
  }

  if (formatted) return formatted;
  return browserOrigin;
};

const withDefaults = (fetcher: Fetcher): Fetcher => {
  const baseURL = resolveAstralApiBase();
  return ((request, options = {}) => {
    const finalOptions: any = {
      credentials: 'include',
      ...options,
    };
    if (baseURL && finalOptions.baseURL === undefined) {
      finalOptions.baseURL = baseURL;
    }
    return fetcher(request, finalOptions);
  }) as Fetcher;
};

export const getRequestFetch = (): Fetcher => {
  const resolved = useRequestFetch();
  if (typeof resolved === 'function') {
    return withDefaults(resolved as Fetcher);
  }
  if (typeof globalThis.$fetch === 'function') {
    return withDefaults(globalThis.$fetch as Fetcher);
  }

  const baseURL = resolveAstralApiBase();
  const fallback = baseURL
    ? ofetch.create({ baseURL, credentials: 'include' })
    : ofetch.create({ credentials: 'include' });

  return fallback as Fetcher;
};
