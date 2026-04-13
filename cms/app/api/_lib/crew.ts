import type { Payload } from 'payload';

import type { User } from '@/payload-types';
import type { AvatarMediaType } from '@astralpirates/shared/avatarMedia';
import { resolveAvatarMediaMetadata } from '../profiles/_lib/avatar';
import { CREW_ROLE_SET, isRoleAtLeast, type CrewRole } from '@astralpirates/shared/crewRoles';

export type CrewSummary = {
  id: number;
  profileSlug: string;
  role: CrewRole;
  firstName: string | null;
  lastName: string | null;
  callSign: string | null;
  displayName: string;
  avatarUrl: string | null;
  avatarMediaType: AvatarMediaType;
  avatarMediaUrl: string | null;
  avatarMimeType: string | null;
  avatarFilename: string | null;
};

export const toCrewSummary = (user: User | null | undefined): CrewSummary | null => {
  if (!user) return null;
  if (!CREW_ROLE_SET.has(user.role as CrewRole)) return null;

  const callSign = user.callSign ?? null;
  const firstName = user.firstName ?? null;
  const lastName = user.lastName ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const displayName = callSign || fullName || `Crewmate #${user.id}`;
  const avatarMedia = resolveAvatarMediaMetadata({
    payload: null,
    uploadDoc: user.avatar,
    avatarUrl: user.avatarUrl ?? null,
    avatarMediaType: (user as any).avatarMediaType,
  });

  return {
    id: user.id,
    profileSlug: user.profileSlug,
    role: user.role,
    firstName,
    lastName,
    callSign,
    displayName,
    avatarUrl: avatarMedia.avatarUrl,
    avatarMediaType: avatarMedia.avatarMediaType,
    avatarMediaUrl: avatarMedia.avatarMediaUrl,
    avatarMimeType: avatarMedia.avatarMimeType,
    avatarFilename: avatarMedia.avatarFilename,
  };
};

export const roleAtLeast = (role: CrewRole | null | undefined, minimum: CrewRole): boolean =>
  role != null && isRoleAtLeast(role, minimum);

export const normalizeCrewRole = (value: unknown): CrewRole | null => {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  if (!CREW_ROLE_SET.has(role as CrewRole)) {
    return null;
  }
  return role as CrewRole;
};

const toUserId = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return toUserId((value as { id?: unknown }).id);
  }
  return null;
};

export const loadCrewSummariesByIds = async (
  payload: Payload,
  userIds: number[],
): Promise<Map<number, CrewSummary>> => {
  const uniqueIds = Array.from(new Set(userIds.map((value) => toUserId(value)).filter((value): value is number => value != null)));
  if (!uniqueIds.length) return new Map();

  const result = await payload.find({
    collection: 'users',
    where: {
      id: {
        in: uniqueIds,
      },
    },
    limit: uniqueIds.length,
    depth: 0,
    overrideAccess: true,
  });

  const map = new Map<number, CrewSummary>();
  result.docs.forEach((doc) => {
    const summary = toCrewSummary(doc as User);
    if (summary) {
      map.set(summary.id, summary);
    }
  });
  return map;
};

type ResolveCrewUserIdsByRolesOptions = {
  pageSize?: number;
  maxPages?: number;
};

export const resolveCrewUserIdsByRoles = async (
  payload: Payload,
  roles: CrewRole[],
  options: ResolveCrewUserIdsByRolesOptions = {},
): Promise<number[]> => {
  const uniqueRoles = Array.from(new Set(roles.map((role) => normalizeCrewRole(role)).filter((role): role is CrewRole => role != null)));
  if (!uniqueRoles.length) return [];

  const pageSize =
    typeof options.pageSize === 'number' && Number.isFinite(options.pageSize) && options.pageSize > 0
      ? Math.floor(options.pageSize)
      : 100;
  const maxPages =
    typeof options.maxPages === 'number' && Number.isFinite(options.maxPages) && options.maxPages > 0
      ? Math.floor(options.maxPages)
      : 50;

  const ownerIds: number[] = [];
  let page = 1;

  while (true) {
    const crewPage = await payload.find({
      collection: 'users',
      where: {
        role: {
          in: uniqueRoles,
        },
      },
      limit: pageSize,
      page,
      depth: 0,
      overrideAccess: true,
    });

    ownerIds.push(...crewPage.docs.map((user) => user.id));
    const currentPage = crewPage.page ?? page;
    const totalPages = crewPage.totalPages ?? currentPage;
    if (currentPage >= totalPages) break;

    page = currentPage + 1;
    if (page > maxPages) break;
  }

  return ownerIds;
};
