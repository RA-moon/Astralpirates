<template>
  <UiStack class="ui-demo-panel" :gap="'var(--space-md)'">
    <UiHeading :level="3" size="h4" :uppercase="false">Alerts & inline notifications</UiHeading>
    <UiText variant="muted">
      Use `UiAlert` for system feedback. Swap variants for severity and toggle the inline layout for compact banners.
    </UiText>

    <UiAlert
      title="Flight plan published"
      description="Crew roster received an update."
      variant="success"
    >
      <template #actions>
        <UiButton size="sm" variant="ghost">View plan</UiButton>
        <UiButton size="sm">Share</UiButton>
      </template>
    </UiAlert>

    <UiAlert
      title="Navigation beacons delayed"
      description="Telemetry feed is stale. Retry in 2 minutes."
      variant="warning"
      closable
    />

    <UiAlert
      title="Critical systems offline"
      variant="danger"
      layout="inline"
    />
  </UiStack>
</template>

<script setup lang="ts">
import { UiAlert, UiButton, UiHeading, UiStack, UiText } from '~/components/ui';
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}
</style>
