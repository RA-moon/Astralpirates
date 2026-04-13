import { defineNuxtPlugin, onNuxtReady } from '#app';

declare global {
  interface Window {
    __ASTRAL_HYDRATED__?: boolean;
    __ASTRAL_NUXT_READY__?: boolean;
  }
}

const markHydrated = () => {
  window.__ASTRAL_HYDRATED__ = true;
  document.documentElement.dataset.astralHydrated = 'true';
};

const markNuxtReady = () => {
  window.__ASTRAL_NUXT_READY__ = true;
  document.documentElement.dataset.astralNuxtReady = 'true';
};

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // Ensure we mark the document even if the app hook never fires (e.g. prerendered routes).
    requestAnimationFrame(markHydrated);
  } else {
    window.addEventListener(
      'DOMContentLoaded',
      () => {
        markHydrated();
      },
      { once: true },
    );
  }

  onNuxtReady(() => {
    markHydrated();
    markNuxtReady();
  });
});
