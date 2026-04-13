<template>
  <PageShell page-path="/" :page-data="page ?? null">
    <PageRenderer v-if="page" :blocks="page?.layout ?? []" :parent-access-policy="page?.accessPolicy ?? null" :owner-id="page?.owner?.id ?? null" />
    <p v-else class="page-fallback">Page content is not available.</p>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import { usePageContent } from '~/composables/usePageContent';

const { data: pageRef, error } = await usePageContent({ path: '/' });

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/index] Failed to load page content', error.value);
}

if (!pageRef.value) {
  // eslint-disable-next-line no-console
  console.warn('[pages/index] No page content returned for /');
}

const page = computed(() => pageRef.value ?? null);
</script>
