<template>
  <div class="ui-accordion" role="presentation">
    <div
      v-for="item in items"
      :key="item.id"
      class="ui-accordion__item"
    >
      <button
        type="button"
        class="ui-accordion__trigger"
        :aria-expanded="isOpen(item.id)"
        @click="toggle(item.id)"
      >
        <span class="ui-accordion__trigger-content">
          <slot name="title" :item="item">
            <span>{{ item.title }}</span>
          </slot>
        </span>
        <span class="ui-accordion__icon" aria-hidden="true">
          {{ isOpen(item.id) ? '−' : '+' }}
        </span>
      </button>
      <transition name="accordion">
        <div
          v-if="isOpen(item.id)"
          class="ui-accordion__panel"
          role="region"
        >
          <slot name="item" :item="item">
            <p v-if="item.content">{{ item.content }}</p>
            <ul v-else-if="item.list">
              <li v-for="entry in item.list" :key="entry">{{ entry }}</li>
            </ul>
          </slot>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export type AccordionItem = {
  id: string;
  title: string;
  content?: string;
  list?: string[];
};

const props = withDefaults(
  defineProps<{
    items?: AccordionItem[];
    multiple?: boolean;
    defaultOpen?: string[];
  }>(),
  {
    items: () => [],
    multiple: false,
    defaultOpen: () => [],
  },
);

const openSet = ref(new Set(props.defaultOpen));

const isOpen = (id: string) => openSet.value.has(id);

const toggle = (id: string) => {
  const next = new Set(openSet.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    if (!props.multiple) {
      next.clear();
    }
    next.add(id);
  }
  openSet.value = next;
};
</script>

<style scoped>
.ui-accordion {
  --ui-accordion-gap: calc(var(--size-base-space-rem) * 0.4);
  --ui-accordion-border-width: var(--size-base-layout-px);
  --ui-accordion-trigger-padding-block: calc(var(--size-base-space-rem) * 0.85);
  --ui-accordion-trigger-padding-inline: var(--size-base-space-rem);
  --ui-accordion-trigger-font-size: var(--size-base-space-rem);
  --ui-accordion-trigger-content-gap: var(--space-xs);
  --ui-accordion-icon-font-size: var(--space-lg);
  --ui-accordion-panel-padding-inline: var(--size-base-space-rem);
  --ui-accordion-panel-padding-block-end: var(--size-base-space-rem);

  display: flex;
  flex-direction: column;
  gap: var(--ui-accordion-gap);
}

.ui-accordion__item {
  border: var(--ui-accordion-border-width) solid var(--color-border-weak);
  border-radius: var(--radius-md);
  background: var(--color-surface-panel);
}

.ui-accordion__trigger {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ui-accordion-trigger-padding-block) var(--ui-accordion-trigger-padding-inline);
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  text-align: left;
  font-size: var(--ui-accordion-trigger-font-size);
  cursor: pointer;
}

.ui-accordion__trigger-content {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-accordion-trigger-content-gap);
}

.ui-accordion__icon {
  font-size: var(--ui-accordion-icon-font-size);
}

.ui-accordion__panel {
  padding: 0 var(--ui-accordion-panel-padding-inline) var(--ui-accordion-panel-padding-block-end);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.accordion-enter-active,
.accordion-leave-active {
  transition: max-height 0.2s ease;
}
</style>
