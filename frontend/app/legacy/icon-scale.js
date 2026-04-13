import { resolveGroupScaleFromPixels } from '../modules/design-system/sizeResolver';

const ICON_STATE = {
  width: null,
  height: null,
  value: null,
  listeners: new Set(),
};

export const iconSize = (
  viewWidth,
  viewHeight,
  u1 = 320,
  u2 = 1440,
  s1 = 24,
  s2 = 32,
  q = 1.15,
  sMin = 20,
  sMax = 36,
) => {
  const safeWidth = Math.max(0, Number(viewWidth) || 0);
  const safeHeight = Math.max(0, Number(viewHeight) || 0);
  if (!safeWidth || !safeHeight) return sMin;
  const u = Math.min(safeWidth, safeHeight);
  const ratio = (u - u1) / (u2 - u1);
  const scaled = q * (s1 + (s2 - s1) * ratio);
  return Math.min(Math.max(scaled, sMin), sMax);
};

const notifyListeners = (value) => {
  ICON_STATE.listeners.forEach((listener) => {
    try {
      listener(value);
    } catch (err) {
      console.error("Icon scale listener error", err);
    }
  });
};

export function updateIconScale(viewWidth, viewHeight) {
  const width = Math.max(0, Number(viewWidth) || 0);
  const height = Math.max(0, Number(viewHeight) || 0);
  if (!width || !height) return ICON_STATE.value;

  if (
    ICON_STATE.value !== null &&
    width === ICON_STATE.width &&
    height === ICON_STATE.height
  ) {
    return ICON_STATE.value;
  }

  const next = iconSize(width, height);
  if (!Number.isFinite(next) || next <= 0) return ICON_STATE.value;

  ICON_STATE.width = width;
  ICON_STATE.height = height;
  ICON_STATE.value = next;
  notifyListeners(next);
  return next;
}

export const getIconScale = () => {
  if (ICON_STATE.value !== null) return ICON_STATE.value;
  if (typeof window !== "undefined") {
    return updateIconScale(window.innerWidth || 0, window.innerHeight || 0);
  }
  return null;
};

export const subscribeIconScale = (listener, { immediate = false } = {}) => {
  if (typeof listener !== "function") return () => {};
  ICON_STATE.listeners.add(listener);
  if (immediate && Number.isFinite(ICON_STATE.value)) {
    listener(ICON_STATE.value);
  }
  return () => {
    ICON_STATE.listeners.delete(listener);
  };
};

export const calculateGroupScale = ({
  viewWidth,
  viewHeight,
  iconPx,
  pixelSize,
  viewportHeight,
  cameraTop,
  cameraBottom,
  baseSize,
}) => {
  const resolvedPixelSize = Number.isFinite(pixelSize)
    ? pixelSize
    : Number.isFinite(iconPx)
    ? iconPx
    : (Number.isFinite(viewWidth) && Number.isFinite(viewHeight)
        ? updateIconScale(viewWidth, viewHeight)
        : getIconScale());

  return resolveGroupScaleFromPixels({
    pixelSize: resolvedPixelSize,
    viewportHeight,
    cameraTop,
    cameraBottom,
    baseSize,
  });
};
