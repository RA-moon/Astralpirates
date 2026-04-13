<template>
  <component
    :is="as"
    :class="['ui-text', `ui-text--${variant}`, { 'ui-text--uppercase': uppercase }]"
    v-bind="$attrs"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    as?: string;
    variant?: 'body' | 'muted' | 'caption' | 'eyebrow' | 'mono';
    uppercase?: boolean;
  }>(),
  {
    as: 'p',
    variant: 'body',
    uppercase: false,
  },
);

defineExpose({ props });
</script>

<style scoped>
.ui-text {
  --ui-text-uppercase-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-text-body-font-size: var(--size-base-space-rem);
  --ui-text-caption-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-text-eyebrow-font-size: var(--space-sm);
  --ui-text-eyebrow-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.5);
  --ui-text-mono-font-size: calc(var(--size-base-space-rem) * 0.95);

  margin: 0;
  font-family: var(--font-family-body);
  line-height: var(--line-height-body);
}

.ui-text--uppercase {
  text-transform: uppercase;
  letter-spacing: var(--ui-text-uppercase-letter-spacing);
}

.ui-text--body {
  color: var(--color-text-primary);
  font-size: var(--ui-text-body-font-size);
}

.ui-text--muted {
  color: var(--color-text-muted);
  font-size: var(--ui-text-body-font-size);
}

.ui-text--caption {
  color: var(--color-text-meta);
  font-size: var(--ui-text-caption-font-size);
}

.ui-text--eyebrow {
  color: var(--color-accent-secondary);
  font-size: var(--ui-text-eyebrow-font-size);
  text-transform: uppercase;
  letter-spacing: var(--ui-text-eyebrow-letter-spacing);
}

.ui-text--mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: var(--ui-text-mono-font-size);
}
</style>
