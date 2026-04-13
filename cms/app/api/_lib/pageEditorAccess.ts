import {
  type CrewRole,
} from '@astralpirates/shared/crewRoles';
import {
  canUseAdminEditOverride,
  type EffectiveAdminMode,
} from '@astralpirates/shared/adminMode';
import { can } from '@astralpirates/shared/authorization';
import type { Payload } from 'payload';

import {
  hasCrewRole,
  type CrewUser,
} from '@/src/access/crew';
import { normaliseId } from './flightPlanMembers';

type PageEditorRules = {
  minRole?: unknown;
  allowedRoles?: unknown;
  allowedUsers?: unknown;
};

type PageAccessDoc = {
  id?: unknown;
  owner?: unknown;
  editor?: PageEditorRules | null;
};

const normalizeRole = (value: unknown): CrewRole | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed as CrewRole;
};

const normalizeEditorIdentifiers = (value: unknown): Set<string> => {
  const identifiers = new Set<string>();
  if (!Array.isArray(value)) return identifiers;
  for (const entry of value) {
    const id = normaliseId(entry);
    if (id != null) {
      identifiers.add(String(id));
      continue;
    }
    if (entry && typeof entry === 'object') {
      const nested = normaliseId((entry as { id?: unknown }).id);
      if (nested != null) {
        identifiers.add(String(nested));
      }
    }
  }
  return identifiers;
};

const normalizeEditorRoles = (value: unknown): Set<string> => {
  const roles = new Set<string>();
  if (!Array.isArray(value)) return roles;
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed) {
      roles.add(trimmed);
    }
  }
  return roles;
};

const canEditByPageRules = ({
  page,
  user,
}: {
  page: PageAccessDoc;
  user: CrewUser;
}): boolean => {
  const rules = page.editor;
  const userId = normaliseId(user.id);
  return can(
    'editPage',
    {
      actor: {
        userId,
        isAuthenticated: userId != null,
        websiteRole: normalizeRole(user.role),
      },
      owner: {
        userId: normaliseId(page.owner),
      },
    },
    {
      minimumRole: rules?.minRole,
      allowedRoles: Array.from(normalizeEditorRoles(rules?.allowedRoles)),
      allowedUserIds: Array.from(normalizeEditorIdentifiers(rules?.allowedUsers)),
    },
  );
};

const canEditPagesGlobally = (user: CrewUser): boolean => {
  const userId = normaliseId(user.id);
  return can('editPage', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole: normalizeRole(user.role),
    },
  });
};

export const resolvePageEditAccess = async ({
  payload,
  pageId,
  user,
  adminMode,
}: {
  payload: Payload;
  pageId: number;
  user: CrewUser | null | undefined;
  adminMode?: EffectiveAdminMode | null;
}): Promise<{ page: PageAccessDoc | null; canEdit: boolean }> => {
  let page: PageAccessDoc | null = null;
  try {
    page = (await payload.findByID({
      collection: 'pages',
      id: pageId,
      depth: 0,
      overrideAccess: true,
    })) as PageAccessDoc;
  } catch {
    return { page: null, canEdit: false };
  }

  if (!hasCrewRole(user)) {
    return { page, canEdit: false };
  }

  if (canEditPagesGlobally(user)) {
    return { page, canEdit: true };
  }

  if (canUseAdminEditOverride(adminMode)) {
    return { page, canEdit: true };
  }

  return {
    page,
    canEdit: canEditByPageRules({ page, user }),
  };
};
