import { computed } from 'vue';
import { useRoute } from '#imports';
import { canReadWithAccessPolicy } from '@astralpirates/shared/accessPolicy';
import { CREW_ROLE_SET, type CrewRole } from '@astralpirates/shared/crewRoles';

import { useAstralFetch } from '~/modules/api';
import {
  PageDocumentSchema,
  PageListResponseSchema,
  type PageListResponse,
  type PageDocument,
} from '@astralpirates/shared/api-contracts';
import { sanitizePageBlocks } from '@astralpirates/shared/pageBlocks';
import { normaliseContentPath } from '~/utils/paths';
import { useSessionStore } from '~/stores/session';

export const usePageContent = (options: { path?: string } = {}) => {
  const route = useRoute();
  const session = useSessionStore();

  const targetPath = computed(() => {
    const source = options.path ?? route.path;
    return normaliseContentPath(source);
  });

  const queryParams = computed(() => ({
    'where[path][equals]': targetPath.value,
    depth: '1',
    limit: '1',
  }));

  return useAstralFetch<PageDocument | null, PageListResponse>('/api/pages', {
    key: () => `page-doc-${targetPath.value || 'home'}`,
    query: queryParams,
    schema: PageListResponseSchema,
    transform: (payload) => {
      const doc = payload.docs[0];
      if (!doc) return null;
      const sanitized = {
        ...doc,
        layout: sanitizePageBlocks(doc.layout),
      };
      const parsed = PageDocumentSchema.parse(sanitized);
      const role = session.currentUser?.role;
      const normalizedRoleValue = typeof role === 'string' ? role.trim().toLowerCase() : null;
      const normalizedRole =
        normalizedRoleValue && CREW_ROLE_SET.has(normalizedRoleValue as CrewRole)
          ? (normalizedRoleValue as CrewRole)
          : null;
      const canReadPage = canReadWithAccessPolicy(parsed.accessPolicy ?? null, {
        isAuthenticated: session.isAuthenticated,
        userId: session.currentUser?.id ?? null,
        ownerId: parsed.owner?.id ?? null,
        crewRole: normalizedRole,
      });
      if (!canReadPage) {
        return null;
      }
      return parsed;
    },
    default: () => null,
  });
};
