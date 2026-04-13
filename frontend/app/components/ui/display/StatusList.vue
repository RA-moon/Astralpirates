<template>
  <ul class="ui-status-list">
    <li
      v-for="item in items"
      :key="itemKey(item)"
      class="ui-status-list__item"
    >
      <div class="ui-status-list__content">
        <div class="ui-status-list__primary">
          <slot name="primary" :item="item">
            <UiText>{{ item.primary }}</UiText>
          </slot>
        </div>
        <div class="ui-status-list__meta">
          <slot name="meta" :item="item">
            <UiText variant="caption">{{ item.meta }}</UiText>
          </slot>
        </div>
      </div>
      <div class="ui-status-list__actions">
        <slot name="actions" :item="item" />
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts" generic="T extends { id?: string | number; primary?: string; meta?: string }">
import UiText from '../foundations/Text.vue';

const props = defineProps<{
  items: T[];
  itemKey?: (item: T) => string | number;
}>();

const itemKey = (item: T) =>
  props.itemKey ? props.itemKey(item) : (item?.id ?? JSON.stringify(item));
</script>

<style scoped>
.ui-status-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-sm);
}

.ui-status-list__item {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  background: var(--color-surface-panel);
}

.ui-status-list__content {
  display: grid;
  gap: var(--space-2xs);
}

.ui-status-list__primary {
  font-weight: var(--font-weight-semibold);
}

.ui-status-list__actions {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
}

@media (--bp-max-sm) {
  .ui-status-list__item {
    flex-direction: column;
    align-items: flex-start;
  }

  .ui-status-list__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
