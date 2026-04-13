<template>
  <span class="ui-tag" :class="[`ui-tag--${variant}`, { 'ui-tag--closable': closable }]" role="status">
    <span class="ui-tag__label">
      <slot />
    </span>
    <button
      v-if="closable"
      type="button"
      class="ui-tag__close"
      :aria-label="closeLabel"
      @click="$emit('close')"
    >
      ×
    </button>
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'default' | 'muted';
    closable?: boolean;
    closeLabel?: string;
  }>(),
  {
    variant: 'default',
    closable: false,
    closeLabel: 'Remove',
  },
);

defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.ui-tag {
  --ui-tag-gap: var(--crew-identity-gap);
  --ui-tag-border-width: var(--size-base-layout-px);
  --ui-tag-padding-block: calc(var(--size-base-space-rem) * 0.2);
  --ui-tag-padding-inline: var(--space-sm);
  --ui-tag-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-tag-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.5);
  --ui-tag-close-font-size: calc(var(--size-base-space-rem) * 0.95);
  --ui-tag-focus-outline-width: calc(var(--size-base-layout-px) * 2);
  --ui-tag-focus-outline-offset: calc(var(--size-base-layout-px) * 2);

  display: inline-flex;
  align-items: center;
  gap: var(--ui-tag-gap);
  border-radius: var(--radius-pill);
  border: var(--ui-tag-border-width) solid var(--color-border-strong);
  padding: var(--ui-tag-padding-block) var(--ui-tag-padding-inline);
  font-size: var(--ui-tag-font-size);
  letter-spacing: var(--ui-tag-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-primary);
  background: var(--color-surface-panel);
}

.ui-tag--muted {
  border-color: var(--color-border-weak);
  color: var(--color-text-secondary);
  background: var(--color-surface-base);
}

.ui-tag__close {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: var(--ui-tag-close-font-size);
  line-height: 1;
  padding: 0;
}

.ui-tag__close:focus-visible {
  outline: var(--ui-tag-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--ui-tag-focus-outline-offset);
  border-radius: var(--radius-pill);
}
</style>
