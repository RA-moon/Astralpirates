<template>
  <section class="ui-demo-panel" data-testid="status-dot-demo">
    <UiStack :gap="'var(--space-md)'">
      <div>
        <UiHeading :level="3" size="h4" :uppercase="false">Status dots</UiHeading>
        <UiText variant="muted">
          Small inline indicators that match the alert/metric severity palette.
        </UiText>
      </div>

      <UiInline class="ui-demo-dot-row">
        <UiStatusDot variant="success">Nominal</UiStatusDot>
        <UiStatusDot variant="warning">Standby</UiStatusDot>
        <UiStatusDot variant="danger">Action needed</UiStatusDot>
        <UiStatusDot>Unknown</UiStatusDot>
      </UiInline>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import { UiHeading, UiInline, UiStack, UiStatusDot, UiText } from '~/components/ui';
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}

.ui-demo-dot-row {
  flex-wrap: wrap;
  gap: var(--space-sm);
}
</style>
