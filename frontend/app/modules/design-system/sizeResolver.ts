export type MenuObjectSizeTargetMode = 'legacy-icon' | 'role-menu-object';

type AvatarRoleSizes = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  hero: number;
  heroCompact: number;
};

type BadgeRoleSizes = {
  xs: number;
  sm: number;
  md: number;
};

type SizeRelations = {
  menuToAvatarHero: number;
  badgeToAvatarHero: number;
  badgeToAvatarChip: number;
  badgeAnchorOffsetToAvatar: number;
};

export type RuntimeSizeSnapshot = {
  iconPx: number;
  baseIconPx: number;
  scaleFactor: number;
  avatar: AvatarRoleSizes;
  badge: BadgeRoleSizes;
  menuObjectPx: number;
  flagReferencePx: number;
  relation: SizeRelations;
};

const BASE_ICON_PX = 32;

const AVATAR_MULTIPLIERS = {
  xs: 1.3125,
  sm: 1.5,
  md: 2.125,
  lg: 2.6875,
  xl: 3.5,
  '2xl': 4,
  hero: 4.125,
  heroCompact: 3.4375,
} as const;

const BADGE_MULTIPLIERS = {
  xs: 0.6,
  sm: 0.75,
  md: 0.85,
} as const;

const RELATIONS: SizeRelations = {
  menuToAvatarHero: 0.58,
  badgeToAvatarHero: 0.2061,
  badgeToAvatarChip: 0.5667,
  badgeAnchorOffsetToAvatar: 0.15,
};

const round = (value: number, precision = 4) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const toFinitePositive = (value: number | null | undefined, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
};

const multiply = (base: number, multiplier: number) => round(base * multiplier, 4);

export const resolveSizeScaleFactor = (iconPx: number | null | undefined, baseIconPx = BASE_ICON_PX) => {
  const safeBase = toFinitePositive(baseIconPx, BASE_ICON_PX);
  const safeIcon = toFinitePositive(iconPx, safeBase);
  return round(safeIcon / safeBase, 6);
};

export const resolveRuntimeSizeSnapshot = (
  iconPx: number | null | undefined,
  options: { baseIconPx?: number } = {},
): RuntimeSizeSnapshot => {
  const baseIconPx = toFinitePositive(options.baseIconPx, BASE_ICON_PX);
  const safeIconPx = toFinitePositive(iconPx, baseIconPx);
  const scaleFactor = resolveSizeScaleFactor(safeIconPx, baseIconPx);

  const avatar: AvatarRoleSizes = {
    xs: multiply(safeIconPx, AVATAR_MULTIPLIERS.xs),
    sm: multiply(safeIconPx, AVATAR_MULTIPLIERS.sm),
    md: multiply(safeIconPx, AVATAR_MULTIPLIERS.md),
    lg: multiply(safeIconPx, AVATAR_MULTIPLIERS.lg),
    xl: multiply(safeIconPx, AVATAR_MULTIPLIERS.xl),
    '2xl': multiply(safeIconPx, AVATAR_MULTIPLIERS['2xl']),
    hero: multiply(safeIconPx, AVATAR_MULTIPLIERS.hero),
    heroCompact: multiply(safeIconPx, AVATAR_MULTIPLIERS.heroCompact),
  };

  const badge: BadgeRoleSizes = {
    xs: multiply(safeIconPx, BADGE_MULTIPLIERS.xs),
    sm: multiply(safeIconPx, BADGE_MULTIPLIERS.sm),
    md: multiply(safeIconPx, BADGE_MULTIPLIERS.md),
  };

  const flagReferencePx = avatar.hero;
  const menuObjectPx = round(flagReferencePx * RELATIONS.menuToAvatarHero, 4);

  return {
    iconPx: safeIconPx,
    baseIconPx,
    scaleFactor,
    avatar,
    badge,
    menuObjectPx,
    flagReferencePx,
    relation: RELATIONS,
  };
};

export const resolveMenuObjectPixelTarget = (
  snapshot: RuntimeSizeSnapshot,
  mode: MenuObjectSizeTargetMode = 'legacy-icon',
) => {
  if (mode === 'role-menu-object') {
    return snapshot.menuObjectPx;
  }
  return snapshot.iconPx;
};

export const resolveGroupScaleFromPixels = ({
  pixelSize,
  viewportHeight,
  cameraTop,
  cameraBottom,
  baseSize,
}: {
  pixelSize: number | null | undefined;
  viewportHeight: number;
  cameraTop: number;
  cameraBottom: number;
  baseSize: number | null | undefined;
}) => {
  if (!baseSize || viewportHeight <= 0) return null;
  const unitsPerPixel = (cameraTop - cameraBottom) / viewportHeight;
  if (!Number.isFinite(unitsPerPixel) || unitsPerPixel <= 0) return null;

  const safePixelSize = toFinitePositive(pixelSize, 0);
  if (!safePixelSize) return null;

  const desiredWorldSize = safePixelSize * unitsPerPixel;
  return desiredWorldSize / baseSize;
};

export const applyRuntimeSizeSnapshotToDocument = (
  snapshot: RuntimeSizeSnapshot,
  options: {
    target?: HTMLElement | null;
    applyScaleFactorToken?: boolean;
    includeRuntimeRoleVars?: boolean;
  } = {},
) => {
  if (typeof document === 'undefined') return;
  const target = options.target ?? document.documentElement;
  if (!target?.style) return;

  target.style.setProperty('--icon-size-px', `${snapshot.iconPx}px`);

  if (options.applyScaleFactorToken) {
    target.style.setProperty('--size-scale-factor', `${snapshot.scaleFactor}`);
  }

  if (options.includeRuntimeRoleVars === false) {
    return;
  }

  target.style.setProperty('--size-runtime-avatar-hero-px', `${snapshot.avatar.hero}px`);
  target.style.setProperty('--size-runtime-badge-md-px', `${snapshot.badge.md}px`);
  target.style.setProperty('--size-runtime-menu-object-px', `${snapshot.menuObjectPx}px`);
};
