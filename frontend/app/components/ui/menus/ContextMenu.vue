<template>
  <div class="ui-context">
    <div
      ref="surfaceRef"
      class="ui-context__surface"
      role="button"
      tabindex="0"
      aria-haspopup="menu"
      @contextmenu.prevent="openMenu"
      @keydown="handleSurfaceKeydown"
    >
      <slot />
    </div>
    <button
      v-if="showFallbackButton"
      type="button"
      class="ui-context__fallback"
      @click.stop="openAtSurfaceCenter"
    >
      <slot name="fallback">{{ fallbackLabel }}</slot>
    </button>
    <Teleport to="body">
      <ul
        v-if="visible"
        class="ui-context__menu"
        :style="{ top: `${position.y}px`, left: `${position.x}px` }"
      >
        <li v-for="item in items" :key="item.label">
          <button type="button" :disabled="item.disabled" @click="handle(item)">
            {{ item.label }}
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

type MenuItem = {
  label: string;
  action: () => void;
  disabled?: boolean;
};

withDefaults(
  defineProps<{
    items: MenuItem[];
    fallbackLabel?: string;
    showFallbackButton?: boolean;
  }>(),
  {
    fallbackLabel: 'Open context menu',
    showFallbackButton: false,
  },
);

const visible = ref(false);
const position = ref({ x: 0, y: 0 });
const surfaceRef = ref<HTMLElement | null>(null);

const openAtPosition = (x: number, y: number) => {
  position.value = { x, y };
  visible.value = true;
};

const openMenu = (event: MouseEvent) => {
  openAtPosition(event.clientX, event.clientY);
};

const openAtSurfaceCenter = () => {
  const el = surfaceRef.value;
  if (!el) {
    openAtPosition(window.innerWidth / 2, window.innerHeight / 2);
    return;
  }
  const rect = el.getBoundingClientRect();
  openAtPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
};

const handle = (item: MenuItem) => {
  if (!item.disabled) {
    item.action();
    visible.value = false;
  }
};

const close = () => {
  visible.value = false;
};

const handleClick = (event: MouseEvent) => {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target && typeof target.closest === 'function' && target.closest('.ui-context__menu')) {
    return;
  }
  close();
};

const handleSurfaceKeydown = (event: KeyboardEvent) => {
  const shouldOpen =
    event.key === 'ContextMenu' ||
    (event.shiftKey && event.key === 'F10') ||
    event.key === 'Enter' ||
    event.key === ' ' ||
    event.key === 'Spacebar';

  if (shouldOpen) {
    event.preventDefault();
    openAtSurfaceCenter();
    return;
  }

  if (event.key === 'Escape') {
    close();
  }
};

const handleWindowKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    close();
  }
};

onMounted(() => {
  window.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleWindowKeydown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClick);
  window.removeEventListener('keydown', handleWindowKeydown);
});
</script>

<style scoped>
.ui-context {
  --ui-context-gap: var(--space-xs);
  --ui-context-border-width: var(--size-base-layout-px);
  --ui-context-focus-outline-width: calc(var(--size-base-layout-px) * 2);
  --ui-context-focus-outline-offset: calc(var(--size-base-layout-px) * 4);
  --ui-context-menu-padding: var(--crew-identity-gap);
  --ui-context-item-padding-block: var(--crew-identity-gap);
  --ui-context-item-padding-inline: calc(var(--size-base-space-rem) * 0.6);
  --ui-context-fallback-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-context-fallback-padding-block: var(--space-2xs);
  --ui-context-fallback-padding-inline: var(--space-xs);

  display: inline-flex;
  flex-direction: column;
  gap: var(--ui-context-gap);
  width: 100%;
}

.ui-context__surface {
  width: 100%;
  outline: none;
}

.ui-context__surface:focus-visible {
  outline: var(--ui-context-focus-outline-width) solid var(--color-border-contrast);
  outline-offset: var(--ui-context-focus-outline-offset);
  border-radius: var(--radius-sm);
}

.ui-context__menu {
  position: absolute;
  background: var(--color-surface-dialog);
  border: var(--ui-context-border-width) solid var(--color-border-weak);
  border-radius: var(--radius-md);
  padding: var(--ui-context-menu-padding);
  list-style: none;
  margin: 0;
  z-index: var(--z-overlay-context);
  box-shadow: var(--shadow-overlay);
}

.ui-context__menu button {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  padding: var(--ui-context-item-padding-block) var(--ui-context-item-padding-inline);
  cursor: pointer;
}

.ui-context__fallback {
  align-self: flex-start;
  border: var(--ui-context-border-width) dashed var(--color-border-weak);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--ui-context-fallback-font-size);
  padding: var(--ui-context-fallback-padding-block) var(--ui-context-fallback-padding-inline);
  cursor: pointer;
}
</style>
