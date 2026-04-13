<template>
  <PageShell page-path="gangway/crew-quarters" :page-data="page ?? null">
    <PageRenderer v-if="page" :blocks="page?.layout ?? []" :parent-access-policy="page?.accessPolicy ?? null" :owner-id="page?.owner?.id ?? null" />
    <UiSurface v-else as="section" variant="card" class="page-fallback">
      <h2 class="animated-title">Crew quarters</h2>
      <p>The crew manifest is offline. Check back after the next dispatch.</p>
    </UiSurface>
  </PageShell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import { usePageContent } from '~/composables/usePageContent';
import { UiSurface } from '~/components/ui';
import { reportClientEvent } from '~/utils/errorReporter';

const { data: pageRef, error } = await usePageContent({ path: 'gangway/crew-quarters' });

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/gangway/crew-quarters] Failed to load page content', error.value);
}

const reportedCrewRosterWarnings = new Set<string>();

const reportRosterAnomaly = (reason: string, meta?: Record<string, unknown>) => {
  if (process.server) return;
  const key = `${reason}:${meta?.pageId ?? 'unknown'}`;
  if (reportedCrewRosterWarnings.has(key)) return;
  reportedCrewRosterWarnings.add(key);
  reportClientEvent({
    component: 'pages/gangway/crew-quarters',
    level: 'warn',
    message: 'Crew roster block missing from page payload',
    meta: {
      reason,
      ...meta,
    },
  });
};

watch(
  () => pageRef.value,
  (doc) => {
    if (!doc) {
      // eslint-disable-next-line no-console
      console.warn('[pages/gangway/crew-quarters] No page content returned for gangway/crew-quarters');
      reportRosterAnomaly('page-missing');
      return;
    }

    const layout = Array.isArray(doc.layout) ? doc.layout : [];
    const hasCrewRoster = layout.some((block) => block.blockType === 'crewRoster');
    if (!hasCrewRoster) {
      reportRosterAnomaly('missing-block', {
        pageId: doc.id ?? null,
        path: doc.path ?? null,
      });
    }
  },
  { immediate: true },
);

const page = computed(() => pageRef.value ?? null);
</script>
