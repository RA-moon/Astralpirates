import { watch } from 'vue';
import { defineNuxtPlugin, useRuntimeConfig } from '#app';
import { useBackgroundPreference } from '~/composables/useBackground';

export default defineNuxtPlugin(() => {
  if (!process.client) return;

  const runtimeConfig = useRuntimeConfig();
  if (runtimeConfig.public?.disableBackground) {
    return;
  }

  const { enabled } = useBackgroundPreference();
  let handle: { dispose: () => void } | null = null;
  let mountObserver: MutationObserver | null = null;

  const disconnectMountObserver = () => {
    if (!mountObserver) return;
    mountObserver.disconnect();
    mountObserver = null;
  };

  const loadFlagOverlay = async () => {
    if (handle || !enabled.value) return;
    const module = await import('~/background');

    const mountOptions = {
      plugins: {
        menuIcon: false,
        valuesIcon: false,
        flag: true,
      },
      transparentBackground: true,
    } as const;

    const mountNow = () => {
      const target = document.getElementById('bg-flag-wrap');
      if (!target) return false;

      if (typeof module.mountBackground === 'function') {
        handle = module.mountBackground(target, mountOptions);
      } else if (typeof module.initBackground === 'function') {
        handle = module.initBackground('#bg-flag-wrap', mountOptions);
      } else {
        return false;
      }

      return true;
    };

    if (mountNow()) {
      disconnectMountObserver();
      return;
    }

    if (mountObserver) return;
    mountObserver = new MutationObserver(() => {
      if (handle) {
        disconnectMountObserver();
        return;
      }
      if (mountNow()) {
        disconnectMountObserver();
      }
    });
    mountObserver.observe(document.documentElement, { childList: true, subtree: true });
  };

  watch(
    enabled,
    (value) => {
      if (value) {
        loadFlagOverlay();
      } else {
        handle?.dispose();
        handle = null;
        disconnectMountObserver();
        const wrap = document.getElementById('bg-flag-wrap');
        if (wrap) {
          wrap.innerHTML = '';
          wrap.removeAttribute('data-bg-init');
        }
      }
    },
    { immediate: true },
  );
});
