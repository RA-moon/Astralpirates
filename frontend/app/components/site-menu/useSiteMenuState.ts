import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useAssetZoomState } from '~/composables/useAssetZoomState';

type MenuAction = 'open' | 'close' | 'toggle';

const emitMenuIconCommand = (action: MenuAction) => {
  if (!process.client) return;
  window.dispatchEvent(
    new CustomEvent('astral:menu-icon-command', {
      detail: { source: 'site-menu', action },
    }),
  );
};

export const useSiteMenuState = () => {
  const isOpen = ref(false);
  const { isAssetZoomActive, closeAssetZoom } = useAssetZoomState();

  const setMenuState = (next: boolean, { notifyIcon = true }: { notifyIcon?: boolean } = {}) => {
    if (isOpen.value === next) return;
    isOpen.value = next;
    if (notifyIcon) emitMenuIconCommand(next ? 'open' : 'close');
  };

  const openMenu = () => setMenuState(true);
  const closeMenu = () => setMenuState(false);

  const handleExternalToggle = (event: Event) => {
    const detail = (event as CustomEvent<{ action?: MenuAction; source?: string }>).detail || {};
    const { action = 'toggle', source } = detail;
    if (source === 'site-menu') return;
    if (source === 'menu-icon' && isAssetZoomActive.value) {
      closeAssetZoom({ force: true, syncMenuObject: false });
      return;
    }
    const next = action === 'open' ? true : action === 'close' ? false : !isOpen.value;
    setMenuState(next, { notifyIcon: false });
  };

  onMounted(() => {
    if (!process.client) return;
    window.addEventListener('astral:menu-toggle', handleExternalToggle);
  });

  onBeforeUnmount(() => {
    if (!process.client) return;
    window.removeEventListener('astral:menu-toggle', handleExternalToggle);
  });

  return {
    isOpen,
    openMenu,
    closeMenu,
  };
};
