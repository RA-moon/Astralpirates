import { NavigationNodesResponseSchema, type NavigationNode } from './api-contracts';

export type FetchNavigationNodesOptions = {
  baseUrl?: string | null;
  limit?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onError?: (error: Error, context: { endpoint: string }) => void;
};

const DEFAULT_LIMIT = 100;

const trimTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
};

const trimLeadingSlashes = (value: string): string => {
  let start = 0;
  while (start < value.length && value.charCodeAt(start) === 47) {
    start += 1;
  }
  return value.slice(start);
};

const sanitizeBaseUrl = (baseUrl: string) => trimTrailingSlashes(baseUrl);

export const buildNavigationNodesEndpoint = (baseUrl: string, limit: number) => {
  const trimmedBase = sanitizeBaseUrl(baseUrl);
  const query = new URLSearchParams({ limit: String(limit) });
  return `${trimmedBase}/api/navigation-nodes?${query.toString()}`;
};

export const fetchNavigationNodesFromCms = async (
  options: FetchNavigationNodesOptions = {},
): Promise<NavigationNode[] | null> => {
  const { baseUrl, limit = DEFAULT_LIMIT, signal, fetchImpl = globalThis.fetch, onError } = options;
  if (!baseUrl || typeof fetchImpl !== 'function') {
    return null;
  }

  const endpoint = buildNavigationNodesEndpoint(baseUrl, limit);
  try {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const parsed = NavigationNodesResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `[navigationNodes] Invalid CMS response (${endpoint}): ${parsed.error.message}`,
      );
    }

    return parsed.data.docs.map((doc) => ({
      ...doc,
      description: doc.description ?? null,
      sourcePath: doc.sourcePath ?? null,
    }));
  } catch (error) {
    if (typeof onError === 'function') {
      onError(error instanceof Error ? error : new Error(String(error)), { endpoint });
    }
    return null;
  }
};

export type NavigationOverrideEntry = {
  label: string;
  description: string | null;
  href: string | null;
};

const normaliseNavigationHref = (href: string | null | undefined) => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return trimmed;
  }
  const withoutLeading = trimLeadingSlashes(trimmed);
  const withoutTrailing = trimTrailingSlashes(withoutLeading);
  return withoutTrailing ? `/${withoutTrailing}` : '/';
};

export const buildNavigationOverrideMap = (docs: NavigationNode[]) =>
  new Map<string, NavigationOverrideEntry>(
    docs.map((doc) => [
      doc.nodeId,
      {
        label: doc.label,
        description: doc.description ?? null,
        href: normaliseNavigationHref(doc.sourcePath),
      },
    ]),
  );

export const fetchNavigationOverrideMap = async (
  options: FetchNavigationNodesOptions = {},
) => {
  const docs = await fetchNavigationNodesFromCms(options);
  if (!docs) {
    return null;
  }
  return buildNavigationOverrideMap(docs);
};
