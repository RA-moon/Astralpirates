<template>
  <nav class="ui-pagination" aria-label="Pagination">
    <button type="button" :disabled="current === 1" @click="change(current - 1)">
      Prev
    </button>
    <span>{{ current }} / {{ total }}</span>
    <button type="button" :disabled="current === total" @click="change(current + 1)">
      Next
    </button>
  </nav>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    current?: number;
    total?: number;
  }>(),
  {
    current: 1,
    total: 1,
  },
);

const emit = defineEmits<{
  change: [value: number];
}>();

const change = (value: number) => {
  if (value < 1 || value > props.total) return;
  emit('change', value);
};
</script>

<style scoped>
.ui-pagination {
  --ui-pagination-gap: var(--space-sm);

  display: inline-flex;
  gap: var(--ui-pagination-gap);
  align-items: center;
}

.ui-pagination button {
  --ui-pagination-button-border-width: var(--size-base-layout-px);
  --ui-pagination-button-pad-y: var(--crew-identity-gap);
  --ui-pagination-button-pad-x: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));

  border: var(--ui-pagination-button-border-width) solid var(--color-border-weak);
  background: transparent;
  color: var(--color-text-primary);
  padding: var(--ui-pagination-button-pad-y) var(--ui-pagination-button-pad-x);
  border-radius: var(--radius-pill);
  cursor: pointer;
}
</style>
