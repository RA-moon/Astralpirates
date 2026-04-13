<template>
  <PageShell page-path="gangway/about" :page-data="page ?? null">
    <PageRenderer v-if="page" :blocks="page?.layout ?? []" :parent-access-policy="page?.accessPolicy ?? null" :owner-id="page?.owner?.id ?? null" />
    <p v-else class="page-fallback">About content is not available.</p>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import { usePageContent } from '~/composables/usePageContent';

const { data: pageRef, error } = await usePageContent({ path: 'gangway/about' });

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/gangway/about] Failed to load page content', error.value);
}

if (!pageRef.value) {
  // eslint-disable-next-line no-console
  console.warn('[pages/gangway/about] No page content returned for gangway/about');
}

const page = computed(() => pageRef.value ?? null);
</script>
