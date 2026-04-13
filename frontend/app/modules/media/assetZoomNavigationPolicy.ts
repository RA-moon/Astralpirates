export type AssetZoomNavigationAction = 'prev' | 'next' | 'goTo';
export const ASSET_ZOOM_NAVIGATION_EVENT = 'astral:asset-zoom-nav';

export type AssetZoomNavigationEventDetail = {
  action?: string;
  index?: number;
  source?: string;
};

export type AssetZoomNavigationCommand =
  | { action: 'prev' }
  | { action: 'next' }
  | { action: 'goTo'; index: number };

export type AssetZoomNavigationPolicy = {
  inputMode: 'arrow-only' | 'arrow-and-swipe';
  gestures: {
    swipeEnabled: boolean;
  };
  controls: {
    alwaysVisible: boolean;
    hideWhenSingle: boolean;
    edgeGutters: boolean;
    centeredVertically: boolean;
    visualSize: 'small';
    hitArea: 'large';
    endBehavior: 'loop';
  };
  contract: {
    actions: readonly AssetZoomNavigationAction[];
    stateKeys: readonly ['canPrev', 'canNext', 'isSingle', 'showArrows'];
  };
};

export type AssetZoomNavigationActions = {
  prev: () => void;
  next: () => void;
  goTo: (index: number) => void;
};

export type AssetZoomNavigationContract = {
  actions: AssetZoomNavigationActions;
  isSingle: boolean;
  canPrev: boolean;
  canNext: boolean;
  showArrows: boolean;
};

export const ASSET_ZOOM_NAVIGATION_POLICY = {
  inputMode: 'arrow-and-swipe',
  gestures: {
    swipeEnabled: true,
  },
  controls: {
    alwaysVisible: true,
    hideWhenSingle: true,
    edgeGutters: true,
    centeredVertically: true,
    visualSize: 'small',
    hitArea: 'large',
    endBehavior: 'loop',
  },
  contract: {
    actions: ['prev', 'next', 'goTo'],
    stateKeys: ['canPrev', 'canNext', 'isSingle', 'showArrows'],
  },
} as const satisfies AssetZoomNavigationPolicy;

export const createAssetZoomNavigationContract = ({
  slideCount,
  actions,
}: {
  slideCount: number;
  actions: AssetZoomNavigationActions;
}): AssetZoomNavigationContract => {
  const totalSlides = Number.isFinite(slideCount) && slideCount > 0 ? Math.trunc(slideCount) : 0;
  const isSingle = totalSlides <= 1;
  const canNavigate = totalSlides > 1;

  const showArrows =
    ASSET_ZOOM_NAVIGATION_POLICY.controls.alwaysVisible &&
    (!ASSET_ZOOM_NAVIGATION_POLICY.controls.hideWhenSingle || !isSingle);

  return {
    actions,
    isSingle,
    canPrev: canNavigate,
    canNext: canNavigate,
    showArrows,
  };
};

export const parseAssetZoomNavigationCommand = (
  detail: AssetZoomNavigationEventDetail | null | undefined,
): AssetZoomNavigationCommand | null => {
  const action = detail?.action;
  if (action === 'prev') return { action };
  if (action === 'next') return { action };
  if (action !== 'goTo') return null;

  const index = detail?.index;
  if (!Number.isFinite(index)) return null;
  const normalizedIndex = Math.trunc(index as number);
  if (normalizedIndex < 0) return null;
  return { action, index: normalizedIndex };
};
