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

  const loadBackground = async () => {
    if (handle || !enabled.value) return;
    const module = await import('~/background');
    if (typeof module.initBackground === 'function') {
      handle = module.initBackground(undefined, {
        plugins: {
          menuIcon: false,
          flag: false,
        },
      });
    }
  };

  watch(
    enabled,
    (value) => {
      if (value) {
        loadBackground();
      } else {
        handle?.dispose();
        handle = null;
        const wrap = document.getElementById('bg-wrap');
        if (wrap) {
          wrap.innerHTML = '';
          wrap.removeAttribute('data-bg-init');
        }
      }
    },
    { immediate: true },
  );
});
