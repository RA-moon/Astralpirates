<template>
  <PageShell page-path="gangway/engineering/bay" :page-data="page ?? null">
    <PageRenderer v-if="page" :blocks="page?.layout ?? []" :parent-access-policy="page?.accessPolicy ?? null" :owner-id="page?.owner?.id ?? null" />

    <DesignSystemCatalog />
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import DesignSystemCatalog from '~/components/design-system/DesignSystemCatalog.vue';
import { usePageContent } from '~/composables/usePageContent';

const { data: pageRef, error } = await usePageContent({ path: 'gangway/engineering/bay' });

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/gangway/engineering/bay] Failed to load page content', error.value);
}

if (!pageRef.value) {
  // eslint-disable-next-line no-console
  console.warn(
    '[pages/gangway/engineering/bay] No page content returned for gangway/engineering/bay',
  );
}

const page = computed(() => pageRef.value ?? null);
</script>
