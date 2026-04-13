import { siteMenuConnectors, siteMenuLayout, siteMenuNodes, type SiteMenuNodeId } from '~/components/site-menu/schema';
import { normaliseRoutePath } from '~/utils/paths';

export type NavigationLink = {
  id: SiteMenuNodeId;
  label: string;
  href: string;
  level: 'core' | 'primary' | 'secondary';
  description?: string | null;
};

export type NavigationOverrides = Partial<
  Record<SiteMenuNodeId, { label?: string; description?: string | null; href?: string | null }>
>;

const isExternalHref = (value: string) =>
  /^(https?:)?\/\//i.test(value) || value.startsWith('mailto:') || value.startsWith('tel:');

export const normaliseNavigationHref = (href?: string | null): string | null => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (isExternalHref(trimmed)) return trimmed;
  return normaliseRoutePath(trimmed);
};

export const createNavigationLinks = (options: {
  includeSecondary?: boolean;
  overrides?: NavigationOverrides;
  excludePaths?: string[];
  currentPath?: string;
} = {}) => {
  const { includeSecondary = false, overrides = {}, excludePaths = [], currentPath } = options;
  const layoutById = new Map(siteMenuLayout.map((entry) => [entry.id, entry]));

  const links: NavigationLink[] = siteMenuNodes
    .map((node) => {
      const layout = layoutById.get(node.id);
      const level = layout?.level ?? 'primary';
      const override = overrides[node.id];
      const resolvedHref =
        normaliseNavigationHref(override?.href ?? node.href) ??
        normaliseNavigationHref(node.href) ??
        node.href;
      return {
        id: node.id,
        label: override?.label ?? node.label,
        href: resolvedHref,
        level,
        description: override?.description ?? null,
      } satisfies NavigationLink;
    })
    .filter((link) => {
      if (!includeSecondary && link.level === 'secondary') return false;
      if (excludePaths.includes(link.href)) return false;
      if (currentPath && link.href === currentPath) return false;
      return true;
    });

  return links;
};

export const primaryNavLinks = (overrides?: NavigationOverrides) => {
  const links = createNavigationLinks({ includeSecondary: false, overrides });
  return links.filter((link) => ['airlock', 'bridge', 'gangway', 'about'].includes(link.id));
};

export const siteMenuConfig = {
  nodes: siteMenuNodes,
  layout: siteMenuLayout,
  connectors: siteMenuConnectors,
};
