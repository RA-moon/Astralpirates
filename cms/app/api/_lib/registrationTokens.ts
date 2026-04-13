import type { Payload } from 'payload';
import type { RegistrationToken } from '@/payload-types';

export type RegistrationTokenPurpose = 'recruit' | 'password_reset';

type RegistrationTokenDoc = RegistrationToken;

type RegistrationTokenListFilters = {
  email?: string | null;
  token?: string | null;
  tokenId?: number | string | null;
  inviterId?: number | string | null;
  targetUserId?: number | string | null;
  purposes?: RegistrationTokenPurpose[] | null;
  onlyUnused?: boolean;
  limit?: number;
};

type RegistrationTokenMutationOptions = {
  req?: unknown;
  warnContext?: Record<string, unknown>;
  warnLabel?: string;
};

const buildPurposeWhere = (
  purposes: RegistrationTokenPurpose[] | null | undefined,
): Record<string, unknown> | null => {
  if (!purposes || purposes.length === 0) return null;
  if (purposes.length === 1) {
    return { purpose: { equals: purposes[0] } };
  }
  return {
    or: purposes.map((purpose) => ({ purpose: { equals: purpose } })),
  };
};

const buildTokenWhere = (filters: RegistrationTokenListFilters): Record<string, unknown> => {
  const and: Record<string, unknown>[] = [];

  if (filters.email) {
    and.push({ email: { equals: filters.email } });
  }

  if (filters.inviterId != null) {
    and.push({ inviter: { equals: filters.inviterId } });
  }

  if (filters.targetUserId != null) {
    and.push({ targetUser: { equals: filters.targetUserId } });
  }

  if (filters.onlyUnused !== false) {
    and.push({ used: { equals: false } });
  }

  const purposeWhere = buildPurposeWhere(filters.purposes);
  if (purposeWhere) {
    and.push(purposeWhere);
  }

  if (filters.tokenId != null && filters.token) {
    and.push({
      or: [{ id: { equals: filters.tokenId } }, { token: { equals: filters.token } }],
    });
  } else if (filters.tokenId != null) {
    and.push({ id: { equals: filters.tokenId } });
  } else if (filters.token) {
    and.push({ token: { equals: filters.token } });
  }

  if (and.length === 0) {
    return {};
  }

  return {
    and,
  };
};

export const listRegistrationTokens = async (
  payload: Payload,
  filters: RegistrationTokenListFilters,
): Promise<RegistrationTokenDoc[]> => {
  const where = buildTokenWhere(filters);
  if (!('and' in where) || !Array.isArray(where.and) || where.and.length === 0) {
    return [];
  }

  const result = await payload.find({
    collection: 'registration-tokens',
    where: where as any,
    depth: 0,
    limit: filters.limit ?? 100,
    overrideAccess: true,
  });

  return result.docs as RegistrationTokenDoc[];
};

export const createRegistrationToken = async (
  payload: Payload,
  data: {
    email: string;
    token: string;
    expiresAt: string;
    purpose: RegistrationTokenPurpose;
    targetUser: number | null;
    inviter?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    used?: boolean;
  },
  options?: { req?: unknown },
): Promise<RegistrationToken> =>
  payload.create({
    collection: 'registration-tokens',
    data: data as any,
    draft: false,
    overrideAccess: true,
    req: options?.req as never,
  }) as Promise<RegistrationToken>;

export const revokeRegistrationTokens = async (
  payload: Payload,
  filters: RegistrationTokenListFilters & { excludeTokenId?: number | string | null },
  options?: RegistrationTokenMutationOptions,
): Promise<RegistrationTokenDoc[]> => {
  const hasLookupGuards =
    Boolean(filters.email) ||
    Boolean(filters.token) ||
    filters.inviterId != null ||
    filters.targetUserId != null ||
    Boolean(filters.purposes && filters.purposes.length > 0);

  if (filters.tokenId != null && !hasLookupGuards) {
    const excludeId =
      filters.excludeTokenId == null ? null : String(filters.excludeTokenId);
    if (excludeId != null && excludeId === String(filters.tokenId)) {
      return [];
    }

    const directTokenId =
      typeof filters.tokenId === 'number'
        ? filters.tokenId
        : Number.parseInt(String(filters.tokenId), 10);
    if (!Number.isFinite(directTokenId)) {
      return [];
    }

    try {
      await payload.delete({
        collection: 'registration-tokens',
        id: directTokenId,
        overrideAccess: true,
        req: options?.req as never,
      });
      return [{ id: directTokenId } as RegistrationTokenDoc];
    } catch (error) {
      payload.logger.warn(
        {
          err: error,
          tokenId: directTokenId,
          ...(options?.warnContext ?? {}),
        },
        options?.warnLabel ?? 'Failed to revoke registration token',
      );
      return [];
    }
  }

  const docs = await listRegistrationTokens(payload, filters);
  const excludeId =
    filters.excludeTokenId == null ? null : String(filters.excludeTokenId);
  const candidates =
    excludeId == null ? docs : docs.filter((doc) => String(doc.id) !== excludeId);

  for (const doc of candidates) {
    try {
      await payload.delete({
        collection: 'registration-tokens',
        id: doc.id,
        overrideAccess: true,
        req: options?.req as never,
      });
    } catch (error) {
      payload.logger.warn(
        {
          err: error,
          tokenId: doc.id,
          ...(options?.warnContext ?? {}),
        },
        options?.warnLabel ?? 'Failed to revoke registration token',
      );
    }
  }

  return candidates;
};
