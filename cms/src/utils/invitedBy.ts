import type { Payload } from 'payload';
import { CAPTAIN_ROLE } from '@astralpirates/shared/crewRoles';

type UserDocLike = {
  id?: unknown;
};

export const resolveUserId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value !== null && 'id' in (value as Record<string, unknown>)) {
    return resolveUserId((value as Record<string, unknown>).id);
  }
  return null;
};

export const resolveCaptainInviterId = async (payload: Payload): Promise<number | null> => {
  const captains = await payload.find({
    collection: 'users',
    where: {
      role: {
        equals: CAPTAIN_ROLE,
      },
    },
    sort: 'createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const captain = captains.docs[0] as UserDocLike | undefined;
  return resolveUserId(captain?.id);
};
