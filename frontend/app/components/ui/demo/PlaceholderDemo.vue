<template>
  <UiSurface variant="subtle" class="ui-demo-placeholder">
    <UiHeading :level="5" size="h5" :uppercase="false">{{ title }}</UiHeading>
    <UiText variant="muted">{{ description }}</UiText>
    <UiText variant="caption">Coming soon — hook this up when the component ships.</UiText>
  </UiSurface>
</template>

<script setup lang="ts">
import { UiHeading, UiSurface, UiText } from '~/components/ui';

defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<style scoped>
.ui-demo-placeholder {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-height: 140px;
  justify-content: center;
}
</style>
