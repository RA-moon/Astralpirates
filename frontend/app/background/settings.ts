import type { FlagSettings, MenuSettings, ValuesSettings } from './types';
import { AVATAR_FALLBACK_IMAGE_URL } from '~/modules/media/avatarUrls';

export const SELECTOR = '#bg-wrap';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const BACKGROUND_CANVAS_ID = 'AstralSpace';
export const TARGET_FPS = 30;
export const VISIBILITY_THRESHOLD = 0.1;

export const SHEEN_HUE_SPEED_RANGE = { min: 0.06, max: 0.11 };
export const COLOR_HUE_SPEED_RANGE = { min: 0.01, max: 0.05 };
export const DEFAULT_COLOR_SATURATION = 0.3;

export const DEFAULT_VALUES_POSITION_OFFSET = { x: 0, y: 0, z: 0 };
export const VALUES_MAX_ROT_SPEED_DEFAULT = Math.PI * 0.6;
export const VALUES_MAX_ROT_SPEED_RANGE = { min: Math.PI * 0.05, max: Math.PI * 3 };
export const VALUES_POINTER_ROT_SCALE_DEFAULT = Math.PI;
export const VALUES_POINTER_ROT_SCALE_RANGE = { min: Math.PI * 0.05, max: Math.PI * 6 };

export const DEFAULT_MENU_SETTINGS: MenuSettings = {
  relativeOffset: 0.5,
  iconRotation: 15,
  scaleMultiplier: 1,
  sizeTarget: 'role-menu-object',
  depthOffset: 1,
  modelUrl: '/assets/models/menu.glb',
};

export const DEFAULT_FLAG_TEXTURE_URL = AVATAR_FALLBACK_IMAGE_URL;

export const DEFAULT_FLAG_SETTINGS: FlagSettings = {
  textureUrl: DEFAULT_FLAG_TEXTURE_URL,
  width: 1.6,
  height: 1.6,
  scale: 0.5,
  segmentsW: 32,
  segmentsH: 18,
  waveAmplitude: 0.18,
  waveFrequency: 2.5,
  waveSpeed: 3,
  verticalRipple: 0.12,
  marginPx: 0,
  offsetPx: { x: 0, y: 0 },
  anchorHorizontal: 'left',
  anchorVertical: 'top',
  depthOffset: 0.8,
  preserveAspect: true,
  centerHitRadius: 0.25,
  homeUrl: '/',
  reduceMotion: false,
};

export const DEFAULT_VALUES_SETTINGS: ValuesSettings = {
  scaleMultiplier: 1.1 * 3 * 1.5 * 1.5,
  modelUrl: '/assets/models/values.glb',
  rotationSpeedRange: { min: -20, max: 20 },
  maxRotationSpeed: VALUES_MAX_ROT_SPEED_DEFAULT,
  pointerSpeedMultiplier: VALUES_POINTER_ROT_SCALE_DEFAULT,
  positionOffset: { ...DEFAULT_VALUES_POSITION_OFFSET },
  reduceMotion: false,
};
