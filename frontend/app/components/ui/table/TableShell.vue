<template>
  <div class="ui-table-shell" role="region">
    <slot name="toolbar" />
    <table>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key">
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="rowKey(row)">
          <td v-for="column in columns" :key="column.key">
            <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
              {{ row[column.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
type Column = {
  key: string;
  label: string;
};

const props = defineProps<{
  columns: Column[];
  rows: Record<string, any>[];
  rowKey?: (row: Record<string, any>) => string | number;
}>();

const rowKey = (row: Record<string, any>) => {
  if (props.rowKey) return props.rowKey(row);
  return row.id ?? JSON.stringify(row);
};
</script>

<style scoped>
.ui-table-shell {
  --ui-table-shell-border-width: var(--size-base-layout-px);
  --ui-table-shell-cell-padding-block: var(--space-sm);
  --ui-table-shell-cell-padding-inline: var(--size-base-space-rem);
  --ui-table-shell-header-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-table-shell-header-font-size: var(--space-sm);

  border: var(--ui-table-shell-border-width) solid var(--color-data-gridline);
  border-radius: var(--radius-md);
  overflow-x: auto;
  background: var(--color-data-surface);
  box-shadow: var(--shadow-card);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: var(--ui-table-shell-cell-padding-block) var(--ui-table-shell-cell-padding-inline);
  text-align: left;
  border-bottom: var(--ui-table-shell-border-width) solid var(--color-data-gridline);
}

th {
  text-transform: uppercase;
  letter-spacing: var(--ui-table-shell-header-letter-spacing);
  font-size: var(--ui-table-shell-header-font-size);
  color: var(--color-data-neutral);
}
</style>
