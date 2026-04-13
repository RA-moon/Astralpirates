<template>
  <div class="ui-toast-region" role="status" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="ui-toast">
      <strong>{{ toast.title }}</strong>
      <p>{{ toast.message }}</p>
      <button type="button" @click="remove(toast.id)">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '~/composables/useToast';

const { toasts, dismiss } = useToast();
const remove = (id: string) => dismiss(id);
</script>

<style scoped>
.ui-toast-region {
  --ui-toast-gap: var(--space-sm);
  --ui-toast-border-width: var(--size-base-layout-px);
  --ui-toast-padding-block: var(--space-sm);
  --ui-toast-padding-inline: var(--size-base-space-rem);
  --ui-toast-min-width: calc(var(--size-avatar-hero) * 1.6667);
  --ui-toast-close-offset: var(--space-2xs);

  position: fixed;
  bottom: var(--space-lg);
  right: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--ui-toast-gap);
}

.ui-toast {
  background: var(--color-surface-dialog);
  border: var(--ui-toast-border-width) solid var(--color-border-weak);
  padding: var(--ui-toast-padding-block) var(--ui-toast-padding-inline);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  min-width: var(--ui-toast-min-width);
  box-shadow: var(--shadow-overlay);
  position: relative;
}

.ui-toast button {
  position: absolute;
  top: var(--ui-toast-close-offset);
  right: var(--ui-toast-close-offset);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
}
</style>
