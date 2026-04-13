import { computed, ref } from 'vue';

type MenuAction = 'open' | 'close';

type AssetZoomState = {
  active: boolean;
  sourceId: string | null;
};

type OpenAssetZoomOptions = {
  sourceId: string;
  syncMenuObject?: boolean;
};

type CloseAssetZoomOptions = {
  sourceId?: string;
  force?: boolean;
  syncMenuObject?: boolean;
};

const emitMenuIconCommand = (action: MenuAction) => {
  if (!process.client) return;
  window.dispatchEvent(
    new CustomEvent('astral:menu-icon-command', {
      detail: { source: 'asset-zoom', action },
    }),
  );
};

export const useAssetZoomState = () => {
  const state = assetZoomState;

  const openAssetZoom = ({ sourceId, syncMenuObject = true }: OpenAssetZoomOptions) => {
    const alreadyActiveForSource = state.value.active && state.value.sourceId === sourceId;
    state.value = {
      active: true,
      sourceId,
    };
    if (!alreadyActiveForSource && syncMenuObject) {
      emitMenuIconCommand('open');
    }
  };

  const closeAssetZoom = ({
    sourceId,
    force = false,
    syncMenuObject = true,
  }: CloseAssetZoomOptions = {}) => {
    if (!state.value.active) return;
    if (!force && sourceId && state.value.sourceId && state.value.sourceId !== sourceId) return;
    state.value = {
      active: false,
      sourceId: null,
    };
    if (syncMenuObject) {
      emitMenuIconCommand('close');
    }
  };

  return {
    isAssetZoomActive: computed(() => state.value.active),
    activeAssetZoomSourceId: computed(() => state.value.sourceId),
    openAssetZoom,
    closeAssetZoom,
  } as const;
};

const assetZoomState = ref<AssetZoomState>({
  active: false,
  sourceId: null,
});
