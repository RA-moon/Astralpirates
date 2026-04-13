import { COLOR_HUE_SPEED_RANGE, REDUCED_MOTION_QUERY, SHEEN_HUE_SPEED_RANGE } from './settings';

export const triangleWave01 = (normalized: number) => {
  const t = normalized % 1;
  return t <= 0.5 ? t * 2 : (1 - t) * 2;
};

export const clampToRange = (value: number, range: { min: number; max: number }) =>
  Math.min(range.max, Math.max(range.min, value));

export const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
};

export const defaultSheenHueSpeed = (now = Date.now()) => {
  const date = new Date(now);
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const normalized = (seconds % 60) / 60;
  const wave = 1 - triangleWave01(normalized);
  const value =
    SHEEN_HUE_SPEED_RANGE.min + (SHEEN_HUE_SPEED_RANGE.max - SHEEN_HUE_SPEED_RANGE.min) * wave;
  return clampToRange(value, SHEEN_HUE_SPEED_RANGE);
};

export const defaultColorHueSpeed = (now = Date.now()) => {
  const date = new Date(now);
  const minutes = date.getMinutes() + date.getSeconds() / 60;
  const normalized = (minutes % 60) / 60;
  const wave = 1 - triangleWave01(normalized);
  const value =
    COLOR_HUE_SPEED_RANGE.min + (COLOR_HUE_SPEED_RANGE.max - COLOR_HUE_SPEED_RANGE.min) * wave;
  return clampToRange(value, COLOR_HUE_SPEED_RANGE);
};

export const ensureDynamicWindowNumber = (
  prop: string,
  computeDefault: () => number,
  range: { min: number; max: number },
) => {
  if (typeof window === 'undefined') return;
  const descriptor = Object.getOwnPropertyDescriptor(window, prop as never);
  if (descriptor?.configurable === false) return;
  if (descriptor && typeof descriptor.value === 'number') {
    const clamped = clampToRange(descriptor.value, range);
    if (clamped !== descriptor.value) {
      Object.defineProperty(window, prop as never, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: clamped,
      });
    }
    return;
  }
  if (descriptor && (typeof descriptor.get === 'function' || typeof descriptor.set === 'function'))
    return;

  Object.defineProperty(window, prop as never, {
    configurable: true,
    enumerable: true,
    get: () => clampToRange(computeDefault(), range),
    set(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        delete (window as any)[prop];
        ensureDynamicWindowNumber(prop, computeDefault, range);
        return;
      }
      const clamped = clampToRange(numeric, range);
      Object.defineProperty(window, prop as never, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: clamped,
      });
    },
  });
};
