<template>
  <section class="design-system container">
    <header class="design-system__intro">
      <UiHeading :level="1">{{ demo?.name ?? 'Demo' }}</UiHeading>
      <UiText variant="muted">{{ demo?.description }}</UiText>
      <UiInline>
        <UiLinkButton to="/design-system">Back to overview</UiLinkButton>
        <UiLinkButton
          v-if="category"
          variant="secondary"
          :to="`/design-system#${category?.id}`"
        >
          View category
        </UiLinkButton>
      </UiInline>
    </header>

    <UiDivider />

    <article v-if="demo" class="design-system__demo-card design-system__demo-card--single">
      <Suspense>
        <component :is="demo.component" v-bind="demo.props" />
        <template #fallback>
          <UiText variant="caption">Loading demo…</UiText>
        </template>
      </Suspense>
    </article>

    <p v-else class="design-system__empty">Demo not found.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, createError } from '#imports';
import { uiDemoRegistry } from '~/components/ui/demo/registry';
import { UiDivider, UiHeading, UiInline, UiLinkButton, UiText } from '~/components/ui';

const route = useRoute();
const demoParam = computed(() => {
  const raw = route.params.demo;
  return Array.isArray(raw) ? raw[0] : raw;
});

const lookup = computed(() => {
  const id = demoParam.value;
  for (const category of uiDemoRegistry) {
    const match = category.demos.find((entry) => entry.id === id);
    if (match) {
      return { category, demo: match };
    }
  }
  return { category: null, demo: null };
});

const category = computed(() => lookup.value.category);
const demo = computed(() => lookup.value.demo);

if (!demo.value && import.meta.server) {
  throw createError({ statusCode: 404, statusMessage: 'Demo not found' });
}
</script>

<style scoped>
.design-system__demo-card {
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  border: var(--size-base-layout-px) solid var(--color-border-panel);
  background: var(--color-surface-panel);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.design-system__demo-card--single {
  padding: 0;
  border: none;
  background: transparent;
}

.design-system__empty {
  text-align: center;
  color: var(--color-text-muted);
}
</style>
