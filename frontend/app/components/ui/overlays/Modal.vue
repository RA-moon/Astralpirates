<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ui-modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="labelId"
      v-bind="$attrs"
      @pointerdown.self="handleBackdrop"
    >
      <div class="ui-modal__panel">
        <header v-if="$slots.header" class="ui-modal__header" :id="labelId">
          <slot name="header" />
        </header>
        <section class="ui-modal__body">
          <slot />
        </section>
        <footer v-if="$slots.footer" class="ui-modal__footer">
          <slot name="footer" />
        </footer>
        <button
          v-if="showClose"
          type="button"
          class="ui-modal__close"
          :aria-label="closeAriaLabel"
          :data-testid="closeButtonTestId"
          @click="close"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useStableId } from '~/composables/useStableId';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    closeOnBackdrop?: boolean;
    showClose?: boolean;
    closeAriaLabel?: string;
    closeButtonTestId?: string;
    closeOnEscape?: boolean;
  }>(),
  {
    modelValue: false,
    closeOnBackdrop: true,
    showClose: true,
    closeAriaLabel: 'Close dialog',
    closeButtonTestId: undefined,
    closeOnEscape: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
  open: [];
}>();

const open = computed(() => props.modelValue);
const close = () => emit('update:modelValue', false);

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.closeOnEscape) return;
  if (event.key === 'Escape') {
    close();
  }
};

const addKeyListener = () => {
  if (typeof window === 'undefined' || !props.closeOnEscape) return;
  window.addEventListener('keydown', handleKeydown);
};

const removeKeyListener = () => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleKeydown);
};

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      emit('open');
    } else {
      emit('close');
    }
    if (visible) {
      addKeyListener();
    } else {
      removeKeyListener();
    }
  },
);

onBeforeUnmount(() => {
  removeKeyListener();
});

const handleBackdrop = () => {
  if (props.closeOnBackdrop) {
    close();
  }
};

const labelId = useStableId('ui-modal');
</script>

<style scoped>
.ui-modal {
  --ui-modal-padding: var(--space-lg);
  --ui-modal-panel-max-width: calc(var(--size-avatar-hero) * 3.9394);
  --ui-modal-border-width: var(--size-base-layout-px);
  --ui-modal-header-font-size: calc(var(--size-base-space-rem) * 1.2);
  --ui-modal-footer-gap: var(--space-sm);
  --ui-modal-close-offset: var(--space-xs);
  --ui-modal-close-size: var(--size-base-icon-px);

  position: fixed;
  inset: 0;
  background: var(--color-surface-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-overlay-modal);
  padding: var(--ui-modal-padding);
  transition: opacity var(--animation-duration-medium) var(--transition-ease-standard);
}

.ui-modal__panel {
  position: relative;
  width: min(var(--ui-modal-panel-max-width), 100%);
  background: var(--color-surface-dialog);
  border: var(--ui-modal-border-width) solid var(--color-border-weak);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
  padding: var(--layout-card-padding);
}

.ui-modal__header {
  font-size: var(--ui-modal-header-font-size);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
}

.ui-modal__body {
  line-height: 1.6;
}

.ui-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-modal-footer-gap);
}

.ui-modal__close {
  position: absolute;
  top: var(--ui-modal-close-offset);
  right: var(--ui-modal-close-offset);
  border: var(--ui-modal-border-width) solid var(--color-border-weak);
  border-radius: 50%;
  width: var(--ui-modal-close-size);
  height: var(--ui-modal-close-size);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
}
</style>
