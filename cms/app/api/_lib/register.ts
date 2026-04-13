const FALLBACK_REGISTER_URL = 'http://localhost:3000/enlist/accept';
const FALLBACK_REGISTER_PATH = '/enlist/accept';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const normalise = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const splitHeaderValues = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const safeParseURL = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const normaliseOrigin = (value: string): string | null => {
  const url = safeParseURL(value);
  if (!url) return null;
  return `${url.protocol}//${url.host}`;
};

const isLocalHost = (hostname: string | null | undefined): boolean => {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(lower);
};

const buildOriginFromForwarded = (proto: string | undefined, host: string): string | null => {
  const trimmedHost = host.trim();
  if (!trimmedHost) return null;

  if (/^https?:\/\//i.test(trimmedHost)) {
    return normaliseOrigin(trimmedHost);
  }

  const primaryProto = normalise(proto)?.toLowerCase() ?? 'https';
  return normaliseOrigin(`${primaryProto}://${trimmedHost}`);
};

const ensurePath = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const originsAreAllLocal = (origins: string[]): boolean =>
  origins.every((origin) => {
    const parsed = safeParseURL(origin);
    return isLocalHost(parsed?.hostname);
  });

export type BuildRegisterUrlOptions = {
  origin?: string | null;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  referer?: string | null;
};

export const resolveRegisterUrlOptions = (headers: Headers): BuildRegisterUrlOptions => ({
  origin: headers.get('origin'),
  forwardedProto: headers.get('x-forwarded-proto'),
  forwardedHost: headers.get('x-forwarded-host'),
  referer: headers.get('referer'),
});

export const buildRegisterURL = (token: string, options?: BuildRegisterUrlOptions): string => {
  const forwardedHosts = splitHeaderValues(options?.forwardedHost);
  const forwardedProto = splitHeaderValues(options?.forwardedProto)[0];
  const refererOrigin = options?.referer ? normaliseOrigin(options.referer) : null;

  const originCandidates: string[] = unique(
    [
      normalise(options?.origin),
      ...forwardedHosts
        .map((host) => buildOriginFromForwarded(forwardedProto, host))
        .filter((value): value is string => Boolean(value)),
      refererOrigin ?? undefined,
      normalise(process.env.FRONTEND_ORIGIN),
      normalise(process.env.CLIENT_ORIGIN),
      normalise(process.env.SITE_ORIGIN),
      normalise(process.env.PAYLOAD_PUBLIC_FRONTEND_URL),
      normalise(process.env.PAYLOAD_PUBLIC_SITE_URL),
      normalise(process.env.PAYLOAD_PUBLIC_SERVER_URL),
    ].filter((value): value is string => Boolean(value)),
  );

  // Ensure we always have at least one valid origin to work with.
  originCandidates.push('http://localhost:3000');

  const normalisedOrigins = unique(
    originCandidates
      .map((candidate) => normaliseOrigin(candidate))
      .filter((value): value is string => Boolean(value)),
  );

  const registerBaseRaw = process.env.REGISTER_LINK_BASE;
  const registerBase = normalise(registerBaseRaw);
  const originsAllLocal = originsAreAllLocal(normalisedOrigins);

  if (registerBase) {
    const explicitBaseUrl = safeParseURL(registerBase);
    if (explicitBaseUrl) {
      if (!isLocalHost(explicitBaseUrl.hostname) || originsAllLocal) {
        explicitBaseUrl.searchParams.set('token', token);
        return explicitBaseUrl.toString();
      }

      // Use the path from the base as a relative candidate if the host is local.
      const pathFromBase = ensurePath(explicitBaseUrl.pathname || FALLBACK_REGISTER_PATH);
      for (const origin of normalisedOrigins) {
        try {
          const url = new URL(pathFromBase, origin);
          url.searchParams.set('token', token);
          return url.toString();
        } catch {
          continue;
        }
      }
    } else {
      // REGISTER_LINK_BASE is present but not a full URL; treat it as a path fragment.
      const relativeBase = ensurePath(registerBase);
      for (const origin of normalisedOrigins) {
        try {
          const url = new URL(relativeBase, origin);
          url.searchParams.set('token', token);
          return url.toString();
        } catch {
          continue;
        }
      }
    }
  }

  const registerPaths = unique(
    [
      normalise(process.env.REGISTER_LINK_PATH),
      FALLBACK_REGISTER_PATH,
    ]
      .filter((value): value is string => Boolean(value))
      .map(ensurePath),
  );

  for (const path of registerPaths) {
    for (const origin of normalisedOrigins) {
      try {
        const url = new URL(path, origin);
        url.searchParams.set('token', token);
        return url.toString();
      } catch {
        continue;
      }
    }
  }

  const fallbackUrl = new URL(FALLBACK_REGISTER_URL);
  fallbackUrl.searchParams.set('token', token);
  return fallbackUrl.toString();
};
