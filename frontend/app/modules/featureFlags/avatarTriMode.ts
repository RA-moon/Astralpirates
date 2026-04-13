const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const readNuxtPublicFlag = (key: string): unknown => {
  if (typeof window === 'undefined') return null;
  const config = (window as any)?.__NUXT__?.config?.public ?? null;
  if (!config || typeof config !== 'object') return null;
  return (config as Record<string, unknown>)[key] ?? null;
};

const resolveBooleanFlag = (candidates: unknown[], fallback = false): boolean => {
  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') return candidate !== 0;
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) continue;
      if (TRUE_VALUES.has(normalized)) return true;
      if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
        return false;
      }
    }
  }
  return fallback;
};

export const isAvatarTriModeEnabled = (): boolean =>
  resolveBooleanFlag(
    [
      readNuxtPublicFlag('avatarTriModeEnabled'),
      import.meta.env?.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED,
      process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED,
    ],
    false,
  );

export const isFlagModelReplacementEnabled = (): boolean =>
  resolveBooleanFlag(
    [
      readNuxtPublicFlag('flagModelReplacementEnabled'),
      import.meta.env?.NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED,
      process.env.NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED,
    ],
    false,
  );
