import { useAstralFetch } from '~/modules/api';
import { NavigationNodesResponseSchema, type NavigationNode } from '@astralpirates/shared/api-contracts';

type NavigationNodesResponse = { docs: NavigationNode[] };

export const useNavigationOverrides = () =>
  useAstralFetch<NavigationNodesResponse>('/api/navigation-nodes', {
    key: () => 'navigation-nodes',
    query: {
      limit: '50',
    },
    schema: NavigationNodesResponseSchema,
    default: () => ({ docs: [] }),
    server: false,
  });
