<template>
  <section class="ui-demo-panel" data-testid="empty-state-demo">
    <UiStack :gap="'var(--space-lg)'">
      <div>
        <UiHeading :level="3" size="h4" :uppercase="false">Empty states</UiHeading>
        <UiText variant="muted">
          Preview the bordered shell, icon slot, and action buttons without touching the CMS.
        </UiText>
      </div>

      <UiEmptyState title="No signals in this band" description="Log a broadcast or pull data from another sector.">
        <template #icon>📡</template>
        <template #actions>
          <UiButton size="sm">Compose broadcast</UiButton>
          <UiButton size="sm" variant="ghost">Import log</UiButton>
        </template>
      </UiEmptyState>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import { UiButton, UiEmptyState, UiHeading, UiStack, UiText } from '~/components/ui';
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}
</style>
