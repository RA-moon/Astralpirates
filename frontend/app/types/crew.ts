import type { AvatarMediaType } from '~/modules/media/avatarMedia';

export type CrewSearchResult = {
  id?: number;
  profileSlug: string;
  displayName?: string | null;
  callSign?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  avatarMediaType?: AvatarMediaType | null;
  avatarMediaUrl?: string | null;
  avatarMimeType?: string | null;
  avatarFilename?: string | null;
  pronouns?: string | null;
};
