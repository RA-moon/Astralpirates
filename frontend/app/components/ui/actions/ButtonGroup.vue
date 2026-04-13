<template>
  <div class="ui-button-group" :class="[`ui-button-group--${orientation}`]">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    orientation?: 'horizontal' | 'vertical';
  }>(),
  {
    orientation: 'horizontal',
  },
);
</script>

<style scoped>
.ui-button-group {
  display: inline-flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.ui-button-group--vertical {
  flex-direction: column;
}
</style>
