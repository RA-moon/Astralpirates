const CLEAR_INVITE_STATE = Object.freeze({
  purpose: null,
  firstName: null,
  lastName: null,
  email: null,
  callSignSnapshot: null,
  profileSlugSnapshot: null,
  tokenId: null,
  token: null,
  sentAt: null,
  expiresAt: null,
  redeemedAt: null,
  invitedUser: null,
  targetUser: null,
  linkHidden: true,
});

export const sanitizeInviteName = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) return null;
  if (!/^[\p{L}][\p{L}'\-\s]+$/u.test(trimmed)) return null;
  return trimmed;
};

export const resolveRelationId = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object' && value !== null && 'id' in (value as Record<string, unknown>)) {
    return resolveRelationId((value as Record<string, unknown>).id);
  }
  return null;
};

export const stringifyRelationId = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'object' && value !== null && 'id' in (value as Record<string, unknown>)) {
    return stringifyRelationId((value as Record<string, unknown>).id);
  }
  return null;
};

const parseTokenId = (raw: unknown): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (raw && typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)) {
    return parseTokenId((raw as { id?: unknown }).id);
  }
  return null;
};

export const resolveElsaBalance = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

export const clearInviteState = () => ({ ...CLEAR_INVITE_STATE });

export const formatInviteState = (raw: any) => {
  const purpose = typeof raw?.purpose === 'string' ? raw.purpose : null;
  const firstName = typeof raw?.firstName === 'string' && raw.firstName.length > 0 ? raw.firstName : null;
  const lastName = typeof raw?.lastName === 'string' && raw.lastName.length > 0 ? raw.lastName : null;
  const email = typeof raw?.email === 'string' && raw.email.length > 0 ? raw.email : null;
  const sentAt = typeof raw?.sentAt === 'string' ? raw.sentAt : null;
  const expiresAt = typeof raw?.expiresAt === 'string' ? raw.expiresAt : null;
  const redeemedAt = typeof raw?.redeemedAt === 'string' ? raw.redeemedAt : null;
  const invitedUser = resolveRelationId(raw?.invitedUser);
  const hasPendingInvite = Boolean(email);
  const canInvite = !hasPendingInvite;
  const canResend = hasPendingInvite && !redeemedAt;
  const linkHidden = raw?.linkHidden !== false;

  return {
    purpose,
    firstName,
    lastName,
    email,
    sentAt,
    expiresAt,
    redeemedAt,
    invitedUser,
    canInvite,
    canResend,
    linkHidden,
  } as const;
};

export const deriveInviteTokenIdentifiers = (invite: any): [number | null, string | null] => {
  if (!invite || typeof invite !== 'object') {
    return [null, null];
  }

  const tokenId = parseTokenId((invite as { tokenId?: unknown }).tokenId);
  const tokenValue = (() => {
    const raw = (invite as { token?: unknown }).token;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  })();

  return [tokenId, tokenValue];
};
