<template>
  <div class="app-shell">
    <div id="background-placeholder" data-static>
      <section id="bg-wrap" class="bg-wrap" aria-hidden="true" />
      <section id="bg-flag-wrap" class="bg-flag-wrap" aria-hidden="true" />
      <section id="bg-menu-wrap" class="bg-menu-wrap" aria-hidden="true" />
    </div>

    <div class="app-content" :class="{ 'app-content--asset-zoom': isAssetZoomActive }">
      <a class="skip-link" href="#content">Skip to content</a>

      <SiteMenu class="site-menu-wrapper--hidden" :overrides="navigationOverrides" />

      <main id="content" class="content-panel" role="main">
        <slot />
        <SiteFooter :overrides="navigationOverrides" />
      </main>

      <div class="action-dock">
        <ElsaBalancePill />
        <AuthControls />
      </div>

      <ProfileInviteOverlay />
      <ActivityWarning />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from '#imports';
import SiteFooter from '~/components/footer/SiteFooter.vue';
import { useNavigationOverrides } from '~/composables/useNavigationOverrides';
import AuthControls from '~/components/auth/AuthControls.vue';
import ProfileInviteOverlay from '~/components/auth/ProfileInviteOverlay.vue';
import ElsaBalancePill from '~/components/auth/ElsaBalancePill.vue';
import ActivityWarning from '~/components/ActivityWarning.vue';
import SiteMenu from '~/components/SiteMenu.vue';
import { subscribeIconScale, updateIconScale, getIconScale } from '~/legacy/icon-scale.js';
import { applyRuntimeSizeSnapshotToDocument, resolveRuntimeSizeSnapshot } from '~/modules/design-system/sizeResolver';
import { useAssetZoomState } from '~/composables/useAssetZoomState';

import type { NavigationOverrides } from '~/utils/siteMenu';
import { normaliseRoutePath } from '~/utils/paths';

const normaliseNavigationHref = (href?: string | null) => {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;
  const isExternal =
    /^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:');
  return isExternal ? trimmed : normaliseRoutePath(trimmed);
};

const overridesResponse = useNavigationOverrides();
const { isAssetZoomActive } = useAssetZoomState();
const route = useRoute();
const robotsDirective = computed(() =>
  normaliseRoutePath(route.path) === '/'
    ? 'index, nofollow'
    : 'noindex, nofollow, noarchive, nosnippet, noimageindex',
);
const navigationOverrides = computed<NavigationOverrides>(() => {
  const docs = overridesResponse.data.value?.docs ?? [];
  return docs.reduce<NavigationOverrides>((acc, node) => {
    acc[node.nodeId as keyof NavigationOverrides] = {
      label: node.label,
      description: node.description ?? null,
      href: normaliseNavigationHref(node.sourcePath),
    };
    return acc;
  }, {});
});

provide('navigationOverrides', navigationOverrides);

const applyIconSize = (value: number | null | undefined) => {
  if (!Number.isFinite(value) || value === null || typeof value === 'undefined') return;
  const snapshot = resolveRuntimeSizeSnapshot(Number(value));
  applyRuntimeSizeSnapshotToDocument(snapshot);
};

if (process.client) {
  watch(
    () => isAssetZoomActive.value,
    (active) => {
      document.body.classList.toggle('is-asset-zoom-active', active);
    },
    { immediate: true },
  );

  onMounted(() => {
    const applyFromWindow = () => {
      const next = updateIconScale(window.innerWidth, window.innerHeight);
      applyIconSize(next);
    };

    const handleResize = () => {
      applyFromWindow();
    };

    const unsubscribe = subscribeIconScale((value: number) => {
      applyIconSize(value);
    }, { immediate: true });

    const initial = getIconScale();
    applyIconSize(initial);
    applyFromWindow();

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize);

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  });

  onBeforeUnmount(() => {
    document.body.classList.remove('is-asset-zoom-active');
  });
}

useHead(() => {
  const crawlerDirective = robotsDirective.value;
  return {
    htmlAttrs: { lang: 'en' },
    titleTemplate: (titleChunk?: string) =>
      titleChunk ? `${titleChunk} · astralpirates.com` : 'astralpirates.com',
    meta: [
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { id: 'meta-robots', name: 'robots', content: crawlerDirective },
      { id: 'meta-googlebot', name: 'googlebot', content: crawlerDirective },
      { name: 'theme-color', content: '#000000' },
      { 'http-equiv': 'cache-control', content: 'no-cache, no-store, must-revalidate' },
      { 'http-equiv': 'pragma', content: 'no-cache' },
      { 'http-equiv': 'expires', content: '0' },
    ],
    link: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap',
      },
      // Always serve our pirate skull favicon from the root so no Nuxt defaults slip through.
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      { rel: 'shortcut icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/favicon.ico' },
    ],
  };
});
</script>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100%;
  padding: 0;
}

.app-content {
  transition: opacity var(--animation-duration-medium) var(--transition-ease-standard);
}

.app-content--asset-zoom {
  opacity: 0;
  pointer-events: none;
}

.bg-wrap,
#bg-wrap {
  position: fixed;
  inset: 0;
  width: 100%;
  overflow: hidden;
  z-index: 0;
  pointer-events: auto;
}

#bg-menu-wrap,
.bg-menu-wrap {
  --bg-menu-target-size: var(--size-runtime-menu-object-px, var(--size-menu-object));
  /* Keep clip center aligned with menu corner placement (flag-reference * relativeOffset). */
  --bg-menu-hit-margin: calc(var(--size-runtime-avatar-hero-px, var(--size-avatar-hero)) * 0.5);
  --bg-menu-hit-radius: calc(var(--bg-menu-target-size) * 1.2);

  position: fixed;
  inset: 0;
  width: 100%;
  overflow: hidden;
  z-index: 2147483000;
  pointer-events: auto;
  clip-path: circle(
    var(--bg-menu-hit-radius) at calc(100% - var(--bg-menu-hit-margin)) var(--bg-menu-hit-margin)
  );
}

.bg-flag-wrap,
#bg-flag-wrap {
  --bg-flag-target-size: var(--size-runtime-avatar-hero-px, var(--size-avatar-hero));
  --bg-flag-hit-margin: calc(var(--bg-flag-target-size) * 0.5);
  --bg-flag-hit-radius: calc(var(--bg-flag-target-size) * 1.25);

  position: fixed;
  inset: 0;
  width: 100%;
  overflow: hidden;
  z-index: 2147482000;
  pointer-events: auto;
  clip-path: circle(var(--bg-flag-hit-radius) at var(--bg-flag-hit-margin) var(--bg-flag-hit-margin));
}

.bg-flag-wrap canvas,
#bg-flag-wrap canvas {
  pointer-events: auto;
}

.bg-menu-wrap canvas,
#bg-menu-wrap canvas {
  pointer-events: auto;
}

.bg-wrap canvas,
#bg-wrap canvas,
:global(#AstralSpace) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: auto;
}

:global(nav),
:global(main),
:global(header),
:global(footer) {
  position: relative;
  z-index: 1;
}

:global(body.is-asset-zoom-active) {
  overflow: hidden;
}

:deep(.site-menu-wrapper--hidden) {
  display: none !important;
}

.action-dock {
  position: fixed;
  right: var(--icon-size-px, var(--size-menu-object));
  bottom: var(--icon-size-px, var(--size-menu-object));
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
}

@media (--bp-max-lg) {
  .action-dock {
    right: var(--icon-size-px, var(--size-menu-object));
    bottom: var(--icon-size-px, var(--size-menu-object));
  }
}
</style>
