<template>
  <section class="ui-demo-panel" data-testid="table-shell-demo">
    <UiStack :gap="'var(--space-lg)'">
      <div>
        <UiHeading :level="3" size="h4" :uppercase="false">Table shell + toolbar</UiHeading>
        <UiText variant="muted">
          Composable columns, scoped slots, and a toolbar slot for filters/actions.
        </UiText>
      </div>

      <UiTableShell :columns="columns" :rows="filteredRows" :row-key="rowKey">
        <template #toolbar>
          <UiTableToolbar>
            <template #filters>
              <UiFilterPills v-model="activeFilter" :pills="filterPills" />
            </template>
            <template #actions>
              <UiButton size="sm" variant="secondary" @click="exportRoster">Export roster</UiButton>
            </template>
          </UiTableToolbar>
        </template>

        <template #cell-status="{ value }">
          <UiStatusDot :variant="statusToVariant(value)">
            {{ value }}
          </UiStatusDot>
        </template>
      </UiTableShell>

      <UiText variant="caption">
        Last action: <strong>{{ lastAction || 'none' }}</strong>
      </UiText>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  UiButton,
  UiFilterPills,
  UiHeading,
  UiStack,
  UiStatusDot,
  UiTableShell,
  UiTableToolbar,
  UiText,
} from '~/components/ui';
import { sampleCrewTableRows, sampleTableColumns } from '~/components/ui/demo/sampleData';

const columns = sampleTableColumns;
const rows = sampleCrewTableRows;
const filterPills = [
  { label: 'All', value: 'all' },
  { label: 'Online', value: 'Online' },
  { label: 'Standby', value: 'Standby' },
  { label: 'Offline', value: 'Offline' },
];

const activeFilter = ref('all');
const lastAction = ref('');

const filteredRows = computed(() => {
  if (activeFilter.value === 'all') return rows;
  return rows.filter((row) => row.status === activeFilter.value);
});

const rowKey = (row: Record<string, any>) => String(row.id ?? '');

const statusToVariant = (status: string) => {
  if (status === 'Online') return 'success';
  if (status === 'Standby') return 'warning';
  if (status === 'Offline') return 'danger';
  return 'default';
};

const exportRoster = () => {
  lastAction.value = `Exported ${filteredRows.value.length} crew`;
};
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}

:global(.ui-table-shell) {
  background: rgba(0, 0, 0, 0.25);
}
</style>
