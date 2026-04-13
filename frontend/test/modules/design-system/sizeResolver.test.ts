import { describe, expect, it } from 'vitest';

import {
  applyRuntimeSizeSnapshotToDocument,
  resolveGroupScaleFromPixels,
  resolveMenuObjectPixelTarget,
  resolveRuntimeSizeSnapshot,
  resolveSizeScaleFactor,
} from '~/modules/design-system/sizeResolver';

describe('sizeResolver', () => {
  it('builds baseline role sizes from icon scale', () => {
    const snapshot = resolveRuntimeSizeSnapshot(32);

    expect(snapshot.iconPx).toBe(32);
    expect(snapshot.scaleFactor).toBe(1);
    expect(snapshot.avatar['2xl']).toBe(128);
    expect(snapshot.avatar.hero).toBe(132);
    expect(snapshot.badge.md).toBe(27.2);
    expect(snapshot.menuObjectPx).toBe(76.56);
  });

  it('derives scaled role sizes for non-baseline icon values', () => {
    const snapshot = resolveRuntimeSizeSnapshot(24);

    expect(snapshot.scaleFactor).toBe(0.75);
    expect(snapshot.avatar.sm).toBe(36);
    expect(snapshot.avatar['2xl']).toBe(96);
    expect(snapshot.avatar.heroCompact).toBe(82.5);
    expect(snapshot.badge.md).toBe(20.4);
  });

  it('selects menu pixel target based on compatibility mode', () => {
    const snapshot = resolveRuntimeSizeSnapshot(32);

    expect(resolveMenuObjectPixelTarget(snapshot, 'legacy-icon')).toBe(32);
    expect(resolveMenuObjectPixelTarget(snapshot, 'role-menu-object')).toBe(76.56);
  });

  it('computes world scale from pixel size and camera bounds', () => {
    const scale = resolveGroupScaleFromPixels({
      pixelSize: 40,
      viewportHeight: 200,
      cameraTop: 5,
      cameraBottom: -5,
      baseSize: 2,
    });

    expect(scale).toBe(1);
  });

  it('writes runtime size css variables onto a target element', () => {
    const target = document.createElement('div');
    const snapshot = resolveRuntimeSizeSnapshot(30);

    applyRuntimeSizeSnapshotToDocument(snapshot, {
      target,
      applyScaleFactorToken: true,
    });

    expect(target.style.getPropertyValue('--icon-size-px')).toBe('30px');
    expect(target.style.getPropertyValue('--size-scale-factor')).toBe('0.9375');
    expect(target.style.getPropertyValue('--size-runtime-avatar-hero-px')).toBe('123.75px');
    expect(target.style.getPropertyValue('--size-runtime-menu-object-px')).toBe('71.775px');
  });

  it('normalizes scale factor from icon pixels', () => {
    expect(resolveSizeScaleFactor(36)).toBe(1.125);
    expect(resolveSizeScaleFactor(20)).toBe(0.625);
  });
});
