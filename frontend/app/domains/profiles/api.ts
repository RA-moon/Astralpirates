import { getRequestFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';
import type { PrivateProfile } from '~/modules/api/schemas';

type AdminModePreferencesPayload = {
  adminViewEnabled: boolean;
  adminEditEnabled: boolean;
};

const buildAuthHeaders = (): Record<string, string> | undefined => {
  const session = useSessionStore();
  if (!session.bearerToken) return undefined;
  return {
    Authorization: `Bearer ${session.bearerToken}`,
  };
};

export const updateOwnProfile = async (payload: FormData | Record<string, unknown>) => {
  const requestFetch = getRequestFetch();
  const body =
    typeof FormData !== 'undefined' && payload instanceof FormData
      ? payload
      : (payload as Record<string, unknown>);

  return requestFetch<{ profile: PrivateProfile }>('/api/profiles/me', {
    method: 'PATCH',
    body,
    headers: buildAuthHeaders(),
  });
};

export const updateOwnAdminModePreferences = async (
  payload: AdminModePreferencesPayload,
) => {
  const requestFetch = getRequestFetch();
  return requestFetch<{ profile: PrivateProfile }>('/api/profiles/me', {
    method: 'PATCH',
    body: {
      adminModeViewPreference: payload.adminViewEnabled,
      adminModeEditPreference: payload.adminEditEnabled,
    },
    headers: buildAuthHeaders(),
  });
};
