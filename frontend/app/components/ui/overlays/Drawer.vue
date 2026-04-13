<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="ui-drawer"
      :class="overlayClass"
      role="dialog"
      aria-modal="true"
      v-bind="overlayAttrs"
      @pointerdown.self="handleBackdrop"
    >
      <aside class="ui-drawer__panel" :class="`ui-drawer__panel--${side}`">
        <header v-if="$slots.header" class="ui-drawer__header">
          <slot name="header" />
        </header>
        <section class="ui-drawer__body">
          <slot />
        </section>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

type DrawerClassValue = string | string[] | Record<string, boolean> | undefined;

defineOptions({
  inheritAttrs: false,
});

const attrs = useAttrs();
const overlayClass = computed<DrawerClassValue>(() => attrs.class as DrawerClassValue);
const overlayAttrs = computed<Record<string, unknown>>(() => {
  const clone = { ...attrs } as Record<string, unknown>;
  delete clone.class;
  return clone;
});

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    side?: 'left' | 'right';
    closeOnBackdrop?: boolean;
  }>(),
  {
    side: 'right',
    closeOnBackdrop: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const handleBackdrop = () => {
  if (props.closeOnBackdrop) {
    emit('update:modelValue', false);
  }
};
</script>

<style scoped>
.ui-drawer {
  --ui-drawer-panel-max-width: calc(var(--size-avatar-hero) * 3.6364);
  --ui-drawer-panel-fluid-max-width: 90%;
  --ui-drawer-border-width: var(--size-base-layout-px);
  --ui-drawer-header-font-size: calc(var(--size-base-space-rem) * 1.1);
  --ui-drawer-header-letter-spacing: var(--crew-identity-meta-letter-spacing);

  position: fixed;
  inset: 0;
  background: var(--color-surface-overlay);
  z-index: var(--z-overlay-drawer);
  display: flex;
  justify-content: flex-end;
  transition: opacity var(--animation-duration-medium) var(--transition-ease-standard);
}

.ui-drawer__panel {
  width: min(var(--ui-drawer-panel-max-width), var(--ui-drawer-panel-fluid-max-width));
  height: 100%;
  background: var(--color-surface-dialog);
  border-left: var(--ui-drawer-border-width) solid var(--color-border-weak);
  padding: var(--layout-card-padding);
  overflow-y: auto;
  box-shadow: var(--shadow-overlay);
  transition: transform var(--animation-duration-medium) var(--transition-ease-standard);
}

.ui-drawer__panel--left {
  margin-left: 0;
  margin-right: auto;
  border-left: none;
  border-right: var(--ui-drawer-border-width) solid var(--color-border-weak);
}

.ui-drawer__header {
  font-size: var(--ui-drawer-header-font-size);
  text-transform: uppercase;
  letter-spacing: var(--ui-drawer-header-letter-spacing);
  margin-bottom: var(--layout-section-gap);
}

.ui-drawer__body {
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
}
</style>
