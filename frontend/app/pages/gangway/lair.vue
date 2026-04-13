<template>
  <PageShell page-path="gangway/lair" :page-data="page ?? null">
    <PageRenderer v-if="page" :blocks="page?.layout ?? []" :parent-access-policy="page?.accessPolicy ?? null" :owner-id="page?.owner?.id ?? null" />
    <UiSurface v-else as="section" variant="card" class="page-fallback">
      <h2 class="animated-title">Lair</h2>
      <p>E.L.S.A. guidance is offline right now. Check back after the next dispatch.</p>
    </UiSurface>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import { usePageContent } from '~/composables/usePageContent';
import { UiSurface } from '~/components/ui';

const { data: pageRef, error } = await usePageContent({ path: 'gangway/lair' });

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/gangway/lair] Failed to load page content', error.value);
}

const page = computed(() => pageRef.value ?? null);
</script>
