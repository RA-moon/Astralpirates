<template>
  <PageShell :page-path="route.path" :page-data="page ?? null">
    <PageRenderer
      v-if="page"
      :blocks="page?.layout ?? []"
      :parent-access-policy="page?.accessPolicy ?? null"
      :owner-id="page?.owner?.id ?? null"
    />
    <p v-else class="page-fallback">Page content is not available.</p>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { createError, useRoute } from '#imports';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import { usePageContent } from '~/composables/usePageContent';

const route = useRoute();
const { data: pageRef, error } = await usePageContent();

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/[...segments]] Failed to load page content', error.value);
}

const page = computed(() => pageRef.value ?? null);

if (!page.value && import.meta.server) {
  throw createError({ statusCode: 404, statusMessage: `Page not found: ${route.path}` });
}
</script>
