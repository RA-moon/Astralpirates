<template>
  <UiStack class="ui-demo-layout">
    <UiHeading :level="5" size="h5" :uppercase="false">Stack</UiHeading>
    <UiStack class="ui-demo-layout__stack" :gap="'var(--space-sm)'">
      <UiSurface variant="subtle">Row A</UiSurface>
      <UiSurface variant="subtle">Row B</UiSurface>
      <UiSurface variant="subtle">Row C</UiSurface>
    </UiStack>

    <UiHeading :level="5" size="h5" :uppercase="false">Inline</UiHeading>
    <UiInline class="ui-demo-layout__inline">
      <UiSurface variant="subtle">Chip One</UiSurface>
      <UiSurface variant="subtle">Chip Two</UiSurface>
      <UiSurface variant="subtle">Chip Three</UiSurface>
    </UiInline>
  </UiStack>
</template>

<script setup lang="ts">
import { UiHeading, UiInline, UiStack, UiSurface } from '~/components/ui';
</script>

<style scoped>
.ui-demo-layout {
  gap: var(--space-md);
}

.ui-demo-layout__stack :deep(.ui-surface) {
  padding: var(--space-sm);
}

.ui-demo-layout__inline {
  flex-wrap: wrap;
}

.ui-demo-layout__inline :deep(.ui-surface) {
  padding: var(--space-xs) var(--space-sm);
}
</style>
