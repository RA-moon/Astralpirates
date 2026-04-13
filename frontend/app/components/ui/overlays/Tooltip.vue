<template>
  <span class="ui-tooltip">
    <span
      ref="triggerRef"
      class="ui-tooltip__trigger"
      @mouseenter="show"
      @mouseleave="hide"
      @focus="show"
      @blur="hide"
    >
      <slot />
    </span>
    <Teleport to="body">
      <div v-if="visible" class="ui-tooltip__bubble" :style="styles" role="tooltip">
        {{ text }}
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

defineProps<{
  text: string;
}>();

const visible = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const rect = ref<DOMRect | null>(null);

const show = () => {
  visible.value = true;
  if (triggerRef.value) {
    rect.value = triggerRef.value.getBoundingClientRect();
  }
};

const hide = () => {
  visible.value = false;
};

const styles = computed(() => {
  if (!rect.value) return {};
  return {
    top: `${rect.value.top}px`,
    left: `${rect.value.left + rect.value.width / 2}px`,
  };
});
</script>

<style scoped>
.ui-tooltip {
  position: relative;
  display: inline-flex;
}

.ui-tooltip__bubble {
  --ui-tooltip-offset-y: var(--space-sm);
  --ui-tooltip-pad-y: calc(var(--size-base-space-rem) * 0.35 * var(--size-scale-factor));
  --ui-tooltip-pad-x: calc(var(--size-base-space-rem) * 0.6 * var(--size-scale-factor));
  --ui-tooltip-radius: calc(var(--size-base-space-rem) * 0.35 * var(--size-scale-factor));
  --ui-tooltip-font-size: var(--space-sm);
  --ui-tooltip-letter-spacing: var(--crew-identity-meta-letter-spacing);

  position: absolute;
  transform: translate(-50%, calc(-100% - var(--ui-tooltip-offset-y)));
  background: var(--color-surface-dialog);
  color: var(--color-text-primary);
  padding: var(--ui-tooltip-pad-y) var(--ui-tooltip-pad-x);
  border-radius: var(--ui-tooltip-radius);
  font-size: var(--ui-tooltip-font-size);
  text-transform: uppercase;
  letter-spacing: var(--ui-tooltip-letter-spacing);
  pointer-events: none;
  z-index: var(--z-overlay-tooltip);
  transition: opacity var(--animation-duration-short) var(--transition-ease-standard);
}
</style>
