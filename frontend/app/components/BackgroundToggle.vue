<template>
  <UiSwitch
    :class="['background-toggle', variantClass]"
    :model-value="enabled"
    @change="onToggle"
  >
    <slot>Animated background</slot>
  </UiSwitch>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { UiSwitch } from '~/components/ui';

const props = withDefaults(
  defineProps<{
    enabled: boolean;
    variant?: 'header' | 'default';
  }>(),
  {
    variant: 'default',
  },
);

const emit = defineEmits<{
  toggle: [enabled: boolean];
}>();

const onToggle = (next: boolean) => {
  emit('toggle', next);
};

const variantClass = computed(() => `background-toggle--${props.variant}`);
</script>

<style scoped>
.background-toggle {
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
}

.background-toggle--default {
  color: var(--color-text-inverse);
}

.background-toggle--header {
  color: var(--color-text-secondary);
}
</style>
