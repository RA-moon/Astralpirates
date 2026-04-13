<template>
  <div class="ui-table-toolbar">
    <div class="ui-table-toolbar__filters">
      <slot name="filters" />
    </div>
    <div class="ui-table-toolbar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ui-table-toolbar {
  --ui-table-toolbar-gap: var(--size-base-space-rem);
  --ui-table-toolbar-padding-block: var(--space-sm);
  --ui-table-toolbar-padding-inline: var(--size-base-space-rem);
  --ui-table-toolbar-border-width: var(--size-base-layout-px);
  --ui-table-toolbar-cluster-gap: var(--space-xs);

  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ui-table-toolbar-gap);
  padding: var(--ui-table-toolbar-padding-block) var(--ui-table-toolbar-padding-inline);
  border-bottom: var(--ui-table-toolbar-border-width) solid var(--color-data-gridline);
  background: var(--color-data-surface);
}

.ui-table-toolbar__filters {
  display: inline-flex;
  gap: var(--ui-table-toolbar-cluster-gap);
  flex-wrap: wrap;
}

.ui-table-toolbar__actions {
  display: inline-flex;
  gap: var(--ui-table-toolbar-cluster-gap);
}
</style>
