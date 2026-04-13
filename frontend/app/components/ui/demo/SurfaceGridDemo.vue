<template>
  <UiGrid :gap="'var(--space-md)'" :min-column-width="'200px'">
    <UiSurface v-for="card in cards" :key="card.title" class="ui-demo-surface">
      <UiHeading :level="5" size="h5" :uppercase="false">
        {{ card.title }}
      </UiHeading>
      <UiText variant="muted">{{ card.body }}</UiText>
      <UiDivider />
      <UiText variant="caption">Token ref: {{ card.token }}</UiText>
    </UiSurface>

    <UiSurface variant="panel" class="ui-demo-surface">
      <UiHeading :level="5" size="h5" :uppercase="false">Panel variant</UiHeading>
      <UiText variant="muted">
        Use <code>variant="panel"</code> for higher contrast surfaces like modals or drawers.
      </UiText>
    </UiSurface>
  </UiGrid>
</template>

<script setup lang="ts">
import { UiDivider, UiGrid, UiHeading, UiSurface, UiText } from '~/components/ui';

const cards = [
  {
    title: 'Standard card',
    body: 'Default surface background + border, matching current marketing cards.',
    token: '--color-surface-panel',
  },
  {
    title: 'Strong panel',
    body: 'Higher contrast background for overlays or onboarding steps.',
    token: '--color-surface-panel-strong',
  },
];
</script>

<style scoped>
.ui-demo-surface {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.ui-demo-surface :deep(code) {
  font-family: inherit;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1rem 0.35rem;
  border-radius: 0.35rem;
}
</style>
