import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { can } from '@astralpirates/shared/authorization';
import { useSessionStore } from '~/stores/session';
import { usePrivateProfile } from '~/domains/profiles';
import type { PageDocument } from '~/modules/api/schemas';
import { normalizeIdentifier } from '~/utils/identifiers';

export type PageEditingPermissions = {
  canEdit: ComputedRef<boolean>;
  isReady: ComputedRef<boolean>;
  error: ComputedRef<unknown | null>;
  refreshProfile: () => Promise<void>;
};

export const usePageEditingPermissions = (
  pageResolver?: () => PageDocument | null | undefined,
): PageEditingPermissions => {
  const session = useSessionStore();
  const privateProfile = usePrivateProfile();

  const page = computed<PageDocument | null>(() => {
    if (typeof pageResolver === 'function') {
      const resolved = pageResolver();
      return resolved ?? null;
    }
    return null;
  });

  const profileRole = computed(() => privateProfile.data.value?.role ?? null);
  const sessionRole = computed(() => session.currentUser?.role ?? null);

  const resolvedRole = computed(() => {
    return profileRole.value ?? sessionRole.value ?? null;
  });

  const isReady = computed(() => {
    if (!session.initialised) return false;
    if (!session.isAuthenticated) return true;
    if (sessionRole.value) return true;
    return !privateProfile.pending.value;
  });

  const editorRules = computed(() => page.value?.editor ?? null);

  const minRole = computed(() => {
    const raw = editorRules.value?.minRole;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
    return null;
  });

  const allowedRoles = computed<Set<string>>(() => {
    const roles = editorRules.value?.allowedRoles ?? [];
    return new Set(roles.filter((role): role is string => typeof role === 'string' && role.trim().length > 0));
  });

  const allowedUsers = computed<Set<string>>(() => {
    const values = editorRules.value?.allowedUsers ?? [];
    const identifiers = values
      .map((value) => normalizeIdentifier(value))
      .filter((value): value is string => value != null && value.length > 0);
    return new Set(identifiers);
  });

  const canEdit = computed(() => {
    if (!isReady.value) return false;
    if (!session.isAuthenticated) return false;

    const userId = normalizeIdentifier(session.currentUser?.id);
    return can(
      'editPage',
      {
        actor: {
          userId,
          isAuthenticated: true,
          websiteRole: resolvedRole.value,
        },
      },
      {
        minimumRole: minRole.value ?? undefined,
        allowedRoles: Array.from(allowedRoles.value),
        allowedUserIds: Array.from(allowedUsers.value),
      },
    );
  });

  const error = computed(() => privateProfile.error.value ?? null);

  const refreshProfile = async () => {
    if (!session.isAuthenticated) return;
    await privateProfile.refresh();
  };

  return {
    canEdit,
    isReady,
    error,
    refreshProfile,
  };
};
