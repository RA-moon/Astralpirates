<template>
  <PageShell page-path="/status" :page-data="null" :hide-connections="true">
    <section class="ship-status">
      <UiStack class="ship-status__intro" :gap="'var(--space-sm)'">
        <UiHeading :level="2">Ship status monitor</UiHeading>
        <UiText>
          Public heartbeat for CMS probes, backup freshness, and deploy audit metadata.
          This page intentionally excludes sensitive host data.
        </UiText>
      </UiStack>

      <UiInline class="ship-status__summary" :gap="'var(--space-sm)'" :align="'center'">
        <UiStatusDot :variant="stateToVariant(statusPayload.state)">
          {{ stateToLabel(statusPayload.state) }}
        </UiStatusDot>
        <UiText variant="caption">Snapshot: {{ formatIso(statusPayload.generatedAt) }}</UiText>
      </UiInline>

      <UiSurface v-if="pending" variant="panel" class="ship-status__loading">
        <UiText>Loading ship status…</UiText>
      </UiSurface>

      <UiAlert
        v-if="error"
        title="Live refresh failed"
        description="Showing fallback status details until the next successful refresh."
        variant="warning"
      />

      <div class="ship-status__grid">
        <UiSurface
          v-for="component in statusPayload.components"
          :key="component.id"
          variant="panel"
          class="ship-status__card"
        >
          <UiStack :gap="'var(--space-sm)'">
            <UiInline class="ship-status__card-heading" :gap="'var(--space-xs)'" :align="'center'">
              <UiHeading :level="3" size="h4">{{ component.label }}</UiHeading>
              <UiStatusDot :variant="stateToVariant(component.state)">
                {{ stateToLabel(component.state) }}
              </UiStatusDot>
            </UiInline>
            <UiText>{{ component.summary }}</UiText>
            <UiText variant="caption">Checked: {{ formatIso(component.checkedAt) }}</UiText>
            <dl v-if="detailEntries(component.details).length" class="ship-status__detail-list">
              <template v-for="[key, value] in detailEntries(component.details)" :key="`${component.id}-${key}`">
                <dt>{{ detailKeyLabel(key) }}</dt>
                <dd>{{ detailValueLabel(value) }}</dd>
              </template>
            </dl>
          </UiStack>
        </UiSurface>
      </div>

      <UiSurface variant="subtle" class="ship-status__contact">
        <UiText variant="muted">
          Need assistance with degraded signals?
          <NuxtLink to="/gangway/about/contact">Contact bridge</NuxtLink>.
        </UiText>
      </UiSurface>
    </section>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import PageShell from '~/components/PageShell.vue';
import { UiAlert, UiHeading, UiInline, UiStack, UiStatusDot, UiSurface, UiText } from '~/components/ui';
import { useAstralFetch } from '~/modules/api';

type ComponentState = 'healthy' | 'degraded' | 'unknown';

type StatusComponent = {
  id: 'cms' | 'backups' | 'deploy';
  label: string;
  state: ComponentState;
  summary: string;
  checkedAt: string;
  details: Record<string, string | number | boolean | null>;
};

type StatusPayload = {
  ok: boolean;
  state: ComponentState;
  generatedAt: string;
  components: StatusComponent[];
};

const defaultStatusPayload: StatusPayload = {
  ok: false,
  state: 'unknown',
  generatedAt: new Date(0).toISOString(),
  components: [
    {
      id: 'cms',
      label: 'CMS health',
      state: 'unknown',
      summary: 'CMS status is not available yet.',
      checkedAt: new Date(0).toISOString(),
      details: {},
    },
    {
      id: 'backups',
      label: 'Backups',
      state: 'unknown',
      summary: 'Backup status is not available yet.',
      checkedAt: new Date(0).toISOString(),
      details: {},
    },
    {
      id: 'deploy',
      label: 'Deploy log',
      state: 'unknown',
      summary: 'Deploy status is not available yet.',
      checkedAt: new Date(0).toISOString(),
      details: {},
    },
  ],
};

const { data, pending, error } = await useAstralFetch<StatusPayload>('/api/status', {
  key: () => 'public-ship-status',
  default: () => defaultStatusPayload,
});

const statusPayload = computed(() => data.value ?? defaultStatusPayload);

const stateToVariant = (value: ComponentState): 'default' | 'success' | 'warning' | 'danger' => {
  if (value === 'healthy') return 'success';
  if (value === 'degraded') return 'danger';
  return 'warning';
};

const stateToLabel = (value: ComponentState) => {
  if (value === 'healthy') return 'Healthy';
  if (value === 'degraded') return 'Degraded';
  return 'Unknown';
};

const formatIso = (value: string | null | undefined) => {
  if (!value) return 'n/a';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'n/a';
  return new Date(parsed).toISOString();
};

const detailEntries = (details: StatusComponent['details']) =>
  Object.entries(details).filter(([, value]) => value !== null && value !== '');

const detailKeyLabel = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const detailValueLabel = (value: string | number | boolean | null) => {
  if (value === null) return 'n/a';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
};
</script>

<style scoped>
.ship-status {
  display: grid;
  gap: var(--space-lg);
}

.ship-status__summary {
  width: 100%;
}

.ship-status__grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor)), 1fr)
  );
  gap: var(--space-md);
}

.ship-status__card {
  min-height: calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor));
}

.ship-status__card-heading {
  justify-content: space-between;
  width: 100%;
}

.ship-status__detail-list {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2xs) var(--space-sm);
  font-size: calc(var(--size-base-space-rem) * 0.85);
}

.ship-status__detail-list dt {
  color: var(--color-text-muted);
}

.ship-status__detail-list dd {
  margin: 0;
  color: var(--color-text-secondary);
  word-break: break-word;
}
</style>
