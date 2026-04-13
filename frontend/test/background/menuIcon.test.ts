import { describe, expect, it, vi } from 'vitest';
import { MenuIcon } from '~/background/plugins/menu-icon';

describe('MenuIcon hit testing', () => {
  it('anchors hit-area center to menu-object distance when role sizing is active', () => {
    const bounds = {
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
    } as DOMRect;

    const iconPx = 32;
    const menuObjectPx = 76.56;
    const halfViewport = 500;
    const centerX = halfViewport + (halfViewport - menuObjectPx);
    const centerY = halfViewport - (halfViewport - menuObjectPx);

    const icon = Object.create(MenuIcon.prototype) as MenuIcon & {
      ready: boolean;
      relativeOffset: number;
      sizeTargetMode: 'legacy-icon' | 'role-menu-object';
      viewport: { width: number; height: number };
      measure: { lastPixelTarget: number; iconPx: number; menuObjectPx: number };
      renderer: { domElement: { getBoundingClientRect: () => DOMRect } };
    };

    icon.ready = true;
    icon.relativeOffset = 1;
    icon.sizeTargetMode = 'role-menu-object';
    icon.viewport = { width: 1000, height: 1000 };
    icon.measure = {
      lastPixelTarget: menuObjectPx,
      iconPx,
      menuObjectPx,
    };
    icon.renderer = {
      domElement: {
        getBoundingClientRect: () => bounds,
      },
    };

    expect(icon.resolveCornerDistancePx()).toBe(menuObjectPx);
    expect(icon.isPointerWithinHit(centerX, centerY, bounds)).toBe(true);
  });
});

describe('MenuIcon pointer rotation', () => {
  it('requests a render frame when pointer rotation updates are applied', () => {
    const requestFrame = vi.fn();
    const icon = Object.create(MenuIcon.prototype) as MenuIcon & {
      ready: boolean;
      pointerState: { active: boolean };
      anchor: {
        quaternion: { identity: () => void };
        updateMatrixWorld: (force?: boolean) => void;
      };
      requestFrame: () => void;
    };

    icon.ready = true;
    icon.pointerState = { active: false };
    icon.anchor = {
      quaternion: { identity: vi.fn() },
      updateMatrixWorld: vi.fn(),
    };
    icon.requestFrame = requestFrame;

    icon.applyPointerRotation();

    expect(requestFrame).toHaveBeenCalledTimes(1);
  });
});
