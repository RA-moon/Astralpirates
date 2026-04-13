import { computed, watchEffect } from 'vue';
import { useAstralFetch } from '~/modules/api';
import {
  PrivateProfileResponseSchema,
  PublicProfileResponseSchema,
  type PrivateProfile,
  type PublicProfile,
} from '@astralpirates/shared/api-contracts';
import { useSessionStore } from '~/stores/session';
import { normalizeAvatarMediaRecord } from '~/modules/media/avatarMedia';

type PublicProfileRedirect = { profileSlug: string };
type PublicProfileResponseWithRedirect = {
  profile: PublicProfile | null;
  redirectTo?: PublicProfileRedirect | null;
};
type PublicProfileState = {
  profile: PublicProfile | null;
  redirectTo: string | null;
};
type PrivateProfileResponse = { profile: PrivateProfile | null };

type ProfileWithAvatarMedia = {
  avatarUrl?: string | null;
  avatarMediaType?: unknown;
  avatarMediaUrl?: string | null;
  avatarMimeType?: string | null;
  avatarFilename?: string | null;
};

const normalizeProfileAvatarMedia = <T extends ProfileWithAvatarMedia | null>(
  profile: T,
): T => {
  if (!profile) return profile;
  const normalized = normalizeAvatarMediaRecord({
    avatarUrl: profile.avatarUrl ?? null,
    avatarMediaType: profile.avatarMediaType,
    avatarMediaUrl: profile.avatarMediaUrl ?? null,
    avatarMimeType: profile.avatarMimeType ?? null,
    avatarFilename: profile.avatarFilename ?? null,
  });
  const unchanged =
    normalized.avatarUrl === (profile.avatarUrl ?? null) &&
    normalized.avatarMediaType === (profile.avatarMediaType ?? null) &&
    normalized.avatarMediaUrl === (profile.avatarMediaUrl ?? null) &&
    normalized.avatarMimeType === (profile.avatarMimeType ?? null) &&
    normalized.avatarFilename === (profile.avatarFilename ?? null);
  if (unchanged) {
    return profile;
  }
  return {
    ...profile,
    avatarUrl: normalized.avatarUrl,
    avatarMediaType: normalized.avatarMediaType,
    avatarMediaUrl: normalized.avatarMediaUrl,
    avatarMimeType: normalized.avatarMimeType,
    avatarFilename: normalized.avatarFilename,
  } as T;
};

export const usePublicProfile = (slugResolver: () => string | null | undefined) => {
  const slug = computed(() => slugResolver()?.trim().toLowerCase() ?? '');
  const result = useAstralFetch<PublicProfileState, PublicProfileResponseWithRedirect>(
    () => `/api/profiles/${slug.value}`,
    {
      key: () => (slug.value ? `public-profile-${slug.value}` : 'public-profile'),
      immediate: false,
      schema: PublicProfileResponseSchema,
      transform: (response) => ({
        profile: normalizeProfileAvatarMedia(response.profile ?? null),
        redirectTo: response.redirectTo?.profileSlug?.trim().toLowerCase() || null,
      }),
      default: () => ({
        profile: null,
        redirectTo: null,
      }),
    },
  );

  watchEffect(() => {
    if (slug.value) {
      result.execute();
    }
  });

  return result;
};

export const usePrivateProfile = () => {
  const session = useSessionStore();
  const shouldFetch = computed(() => session.isAuthenticated);

  const result = useAstralFetch<PrivateProfile | null, PrivateProfileResponse>('/api/profiles/me', {
    key: 'private-profile',
    requiresAuth: true,
    authOptional: true,
    immediate: false,
    schema: PrivateProfileResponseSchema,
    transform: (response) => normalizeProfileAvatarMedia(response.profile ?? null),
    default: null,
    onResponseError: (ctx) => {
      if (ctx.response) {
        (ctx.response as { _data?: PrivateProfileResponse })._data = { profile: null };
      }
    },
  });

  watchEffect(() => {
    if (shouldFetch.value) {
      result.execute();
    } else {
      result.data.value = null;
      result.error.value = undefined;
      result.pending.value = false;
    }
  });

  return result;
};
