import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_ZOOM_NAVIGATION_POLICY,
  createAssetZoomNavigationContract,
  parseAssetZoomNavigationCommand,
} from '~/modules/media/assetZoomNavigationPolicy';

describe('assetZoomNavigationPolicy', () => {
  it('defines fullscreen navigation SSOT decisions', () => {
    expect(ASSET_ZOOM_NAVIGATION_POLICY.inputMode).toBe('arrow-and-swipe');
    expect(ASSET_ZOOM_NAVIGATION_POLICY.gestures.swipeEnabled).toBe(true);
    expect(ASSET_ZOOM_NAVIGATION_POLICY.controls.alwaysVisible).toBe(true);
    expect(ASSET_ZOOM_NAVIGATION_POLICY.controls.hideWhenSingle).toBe(true);
    expect(ASSET_ZOOM_NAVIGATION_POLICY.controls.endBehavior).toBe('loop');
    expect(ASSET_ZOOM_NAVIGATION_POLICY.controls.edgeGutters).toBe(true);
    expect(ASSET_ZOOM_NAVIGATION_POLICY.controls.visualSize).toBe('small');
    expect(ASSET_ZOOM_NAVIGATION_POLICY.controls.hitArea).toBe('large');
  });

  it('creates a loop-ready contract and hides arrows for single-slide mode', () => {
    const actions = {
      prev: vi.fn(),
      next: vi.fn(),
      goTo: vi.fn(),
    };

    const single = createAssetZoomNavigationContract({ slideCount: 1, actions });
    expect(single.isSingle).toBe(true);
    expect(single.showArrows).toBe(false);
    expect(single.canPrev).toBe(false);
    expect(single.canNext).toBe(false);

    const multi = createAssetZoomNavigationContract({ slideCount: 3, actions });
    expect(multi.isSingle).toBe(false);
    expect(multi.showArrows).toBe(true);
    expect(multi.canPrev).toBe(true);
    expect(multi.canNext).toBe(true);
    expect(multi.actions).toBe(actions);
  });

  it('parses only valid navigation commands', () => {
    expect(parseAssetZoomNavigationCommand({ action: 'prev' })).toEqual({ action: 'prev' });
    expect(parseAssetZoomNavigationCommand({ action: 'next' })).toEqual({ action: 'next' });
    expect(parseAssetZoomNavigationCommand({ action: 'goTo', index: 2.9 })).toEqual({
      action: 'goTo',
      index: 2,
    });

    expect(parseAssetZoomNavigationCommand({ action: 'goTo' })).toBeNull();
    expect(parseAssetZoomNavigationCommand({ action: 'goTo', index: -1 })).toBeNull();
    expect(parseAssetZoomNavigationCommand({ action: 'noop' })).toBeNull();
    expect(parseAssetZoomNavigationCommand(undefined)).toBeNull();
  });
});
