const DEFAULT_REGISTRATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 2;
const DEFAULT_EMAIL_TRANSPORT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_REGISTRATION_INVITE_LIMIT = 3;

const parsePositiveInteger = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const REGISTRATION_TOKEN_TTL_MS = parsePositiveInteger(
  process.env.REGISTRATION_TOKEN_TTL,
  DEFAULT_REGISTRATION_TOKEN_TTL_MS,
);

export const EMAIL_TRANSPORT_COOLDOWN_MS = parsePositiveInteger(
  process.env.EMAIL_TRANSPORT_COOLDOWN_MS,
  DEFAULT_EMAIL_TRANSPORT_COOLDOWN_MS,
);

export const REGISTRATION_INVITE_LIMIT = parsePositiveInteger(
  process.env.REGISTRATION_INVITE_LIMIT,
  DEFAULT_REGISTRATION_INVITE_LIMIT,
);
