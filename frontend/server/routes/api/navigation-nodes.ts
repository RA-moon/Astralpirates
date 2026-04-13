import { defineCachedEventHandler, useNitroApp } from '#imports';
import { fetchNavigationNodesFromCms } from '@astralpirates/shared/navigationNodes';
import type { NavigationNode } from '@astralpirates/shared/api-contracts';

import { applyCacheControl, loadFromCms, resolveAstralApiBase, type CmsLogger } from '../../utils/cms';

const FALLBACK_DOCS: NavigationNode[] = [
  {
    id: 1,
    nodeId: 'airlock-home',
    label: 'Airlock (home)',
    description: 'Astralpirates.com landing bay',
    sourcePath: '/',
  },
  {
    id: 2,
    nodeId: 'bridge',
    label: 'Bridge',
    description: 'Mission control + command logs',
    sourcePath: '/bridge',
  },
  {
    id: 3,
    nodeId: 'gangway',
    label: 'Gangway',
    description: 'Crew recruitment + about pages',
    sourcePath: '/gangway',
  },
  {
    id: 4,
    nodeId: 'logbook',
    label: 'Logbook',
    description: 'Flight logs + mission journals',
    sourcePath: '/logbook',
  },
];

const CACHE_HEADER = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60';
const CACHE_MAX_AGE_SECONDS = 60;

const cachedHandler = defineCachedEventHandler(
  async (_event) => {
    const { logger } = useNitroApp() as { logger?: CmsLogger };
    const cmsLogger = logger ?? console;
    const baseUrl = resolveAstralApiBase();
    const docs =
      (await loadFromCms({
        baseUrl,
        logger: cmsLogger,
        fetcher: fetchNavigationNodesFromCms,
        missingConfigMessage:
          '[navigation-nodes] Missing astralApiBase runtime config; falling back to defaults',
        errorLogMessage: '[navigation-nodes] Failed to load CMS overrides',
      })) ?? FALLBACK_DOCS;
    return { docs };
  },
  { name: 'api-navigation-nodes', maxAge: CACHE_MAX_AGE_SECONDS },
);

export default async (event: Parameters<Parameters<typeof defineCachedEventHandler>[0]>[0]) => {
  const result = await cachedHandler(event);
  applyCacheControl(event, CACHE_HEADER);
  return result;
};
