<template>
  <span class="ui-popover">
    <span ref="triggerRef" class="ui-popover__trigger" @click="toggle">
      <slot name="trigger" />
    </span>
    <Teleport to="body">
      <div
        v-if="open"
        class="ui-popover__content"
        :style="contentStyles"
        @click.stop
      >
        <slot />
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    offset?: number;
  }>(),
  {
    offset: 8,
  },
);

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const rect = ref<DOMRect | null>(null);

const updateRect = () => {
  if (triggerRef.value) {
    rect.value = triggerRef.value.getBoundingClientRect();
  }
};

const contentStyles = computed(() => {
  if (!rect.value) return {};
  return {
    top: `${rect.value.bottom + props.offset}px`,
    left: `${rect.value.left}px`,
  };
});

const toggle = () => {
  open.value = !open.value;
  if (open.value) {
    updateRect();
  }
};

const close = () => {
  open.value = false;
};

const handleClick = (event: MouseEvent) => {
  if (!triggerRef.value?.contains(event.target as Node)) {
    close();
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    close();
  }
};

onMounted(() => {
  window.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClick);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.ui-popover {
  position: relative;
  display: inline-flex;
}

.ui-popover__content {
  position: absolute;
  z-index: var(--z-overlay-popover);
  min-width: calc(var(--size-base-layout-px) * 200 * var(--size-scale-factor));
  background: var(--color-surface-dialog);
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  box-shadow: var(--shadow-card);
  transition: opacity var(--animation-duration-short) var(--transition-ease-standard);
}
</style>
