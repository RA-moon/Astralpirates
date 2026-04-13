<template>
  <section class="container site-menu-playground" :class="{ 'site-menu-playground--flat': !backgroundEnabled }">
    <header class="site-menu-playground__header">
      <h1 class="animated-title">Site Menu Playground</h1>
      <p>
        This route mounts the <code>SiteMenu</code> component on its own so you can iterate without the rest of the
        layout. Use the toggle button to open the overlay. Hot-module reloading applies while <code>pnpm dev</code> is
        running.
      </p>
      <UiButton type="button" variant="secondary" @click="toggleBackground">
        <span v-if="backgroundEnabled">Disable background</span>
        <span v-else>Enable background</span>
      </UiButton>
    </header>

    <SiteMenu />
  </section>
</template>

<script setup lang="ts">
import { createError, useState } from '#app';
import SiteMenu from '~/components/SiteMenu.vue';
import { UiButton } from '~/components/ui';

definePageMeta({
  layout: false,
});

if (import.meta.server && !process.dev) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not Found',
  });
}

const backgroundEnabled = useState<boolean>('background-enabled', () => !process.dev);

const toggleBackground = () => {
  backgroundEnabled.value = !backgroundEnabled.value;
};
</script>

<style scoped>
.site-menu-playground {
  display: grid;
  gap: var(--space-xl);
  padding: var(--content-panel-padding);
  position: relative;
  z-index: 1;
}

.site-menu-playground__header {
  display: grid;
  gap: var(--space-sm);
}

.site-menu-playground--flat::before {
  content: '';
  position: fixed;
  inset: 0;
  background: #02040a;
  z-index: -1;
}

.site-menu-playground--flat ::v-deep(#background-placeholder),
.site-menu-playground--flat ::v-deep(#bg-wrap) {
  display: none !important;
}
</style>
