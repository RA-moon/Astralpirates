<template>
  <div class="ui-collapsible">
    <button
      type="button"
      class="ui-collapsible__trigger"
      :aria-expanded="open"
      @click="toggle"
    >
      <slot name="trigger">Toggle</slot>
      <span class="ui-collapsible__icon">{{ open ? '−' : '+' }}</span>
    </button>
    <transition name="collapsible">
      <div v-if="open" class="ui-collapsible__content">
        <slot />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    defaultOpen?: boolean;
  }>(),
  {
    modelValue: undefined,
    defaultOpen: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const open = ref(props.modelValue ?? props.defaultOpen);

watch(
  () => props.modelValue,
  (next) => {
    if (typeof next === 'boolean') {
      open.value = next;
    }
  },
);

const toggle = () => {
  open.value = !open.value;
  emit('update:modelValue', open.value);
};
</script>

<style scoped>
.ui-collapsible__trigger {
  --ui-collapsible-trigger-pad-y: calc(var(--size-base-space-rem) * 0.6 * var(--size-scale-factor));
  --ui-collapsible-trigger-pad-x: var(--space-sm);
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ui-collapsible-trigger-pad-y) var(--ui-collapsible-trigger-pad-x);
  border: none;
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  cursor: pointer;
}

.ui-collapsible__icon {
  font-size: calc(var(--size-base-space-rem) * 1.2 * var(--size-scale-factor));
}

.ui-collapsible__content {
  padding: var(--space-sm);
  background: var(--color-surface-panel);
}
</style>
