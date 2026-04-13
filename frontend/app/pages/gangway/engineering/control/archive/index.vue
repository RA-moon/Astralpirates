<template>
  <PageShell page-path="gangway/engineering/control/archive" :page-data="null">
    <section class="plan-index">
      <UiStack as="header" class="plan-index__intro" :gap="'var(--space-sm)'">
        <UiHeading :level="1" size="h2">Control archive</UiHeading>
        <UiText>
          Browse archived plans that are already implemented on the website
          (<strong>shipped</strong>/<strong>tested</strong>) or intentionally <strong>canceled</strong>.
        </UiText>
        <UiInline :gap="'var(--space-xs)'" class="plan-index__badges" :align="'center'">
          <UiBadge :value="implementedPlans.length" variant="success">Implemented</UiBadge>
          <UiBadge :value="canceledPlans.length" variant="muted">Canceled</UiBadge>
          <UiBadge v-if="plansGeneratedAtLabel && isAuthenticated" variant="muted">
            Snapshot {{ plansGeneratedAtLabel }}
          </UiBadge>
        </UiInline>
      </UiStack>

      <UiSurface v-if="!sessionReady" variant="panel" class="plan-index__guard">
        <UiStack :gap="'var(--space-xs)'">
          <UiHeading :level="2" size="h4">Checking access…</UiHeading>
          <UiText variant="muted">Confirming your session before loading plans.</UiText>
        </UiStack>
      </UiSurface>

      <UiSurface v-else-if="!isAuthenticated" variant="panel" class="plan-index__guard">
        <UiStack :gap="'var(--space-sm)'">
          <UiHeading :level="2" size="h4">Crew access required</UiHeading>
          <UiText variant="muted">
            Log in to view archived plans and plan details. Plan links stay hidden until you embark.
          </UiText>
          <UiButton @click="openAuthDialog">
            Embark to view archive
          </UiButton>
        </UiStack>
      </UiSurface>

      <template v-else>
        <UiSurface variant="panel" class="plan-index__filters">
          <UiStack :gap="'var(--space-sm)'">
            <UiInline :gap="'var(--space-sm)'" class="plan-index__filter-row">
              <UiStack class="plan-index__filter" :gap="'var(--space-xxs)'">
                <UiText size="sm" variant="muted">Search</UiText>
                <UiTextInput v-model="search" placeholder="Search plans by title, owner, or summary" />
              </UiStack>
              <UiStack class="plan-index__filter" :gap="'var(--space-xxs)'">
                <UiText size="sm" variant="muted">Status</UiText>
                <UiSelect v-model="statusFilter" :options="statusOptions" />
              </UiStack>
              <UiStack class="plan-index__filter" :gap="'var(--space-xxs)'">
                <UiText size="sm" variant="muted">Tier</UiText>
                <UiSelect v-model="tierFilter" :options="tierOptions" />
              </UiStack>
            </UiInline>
            <UiAlert v-if="plansError" variant="warning">
              Loading plans from CMS failed; showing the bundled snapshot instead.
            </UiAlert>
          </UiStack>
        </UiSurface>

        <div class="plan-index__lists">
          <UiSurface variant="panel" class="plan-index__list">
            <UiStack :gap="'var(--space-sm)'">
              <UiInline :gap="'var(--space-xs)'" :align="'center'" class="plan-index__list-heading">
                <UiHeading :level="2" size="h4">Implemented on website</UiHeading>
                <UiBadge :value="implementedPlans.length" variant="success" />
              </UiInline>
              <UiText variant="muted">
                Plans that are successfully live (`shipped` or `tested`).
              </UiText>
              <ul v-if="implementedPlans.length" class="plan-index__items">
                <li v-for="plan in implementedPlans" :key="plan.id">
                  <NuxtLink :to="resolvePlanHref(plan)" class="plan-card">
                    <UiInline class="plan-card__meta" :gap="'var(--space-xs)'" :align="'center'">
                      <UiHeading :level="3" size="h5">{{ plan.title }}</UiHeading>
                      <UiBadge :variant="resolveStatusVariant(plan.status)">
                        {{ formatStatusLabel(plan.status) }}
                      </UiBadge>
                      <UiBadge variant="muted">{{ formatTierLabel(plan.tier) }}</UiBadge>
                      <UiBadge variant="muted">Owner · {{ plan.owner ?? 'Unassigned' }}</UiBadge>
                    </UiInline>
                    <UiText class="plan-card__summary" variant="muted">
                      {{ plan.summary || 'No summary provided yet.' }}
                    </UiText>
                    <UiInline class="plan-card__footer" :gap="'var(--space-sm)'" :align="'center'">
                      <UiText variant="muted">Updated {{ formatUpdated(plan.lastUpdated) }}</UiText>
                      <UiText v-if="plan.path" variant="muted" class="plan-card__path">
                        {{ plan.path }}
                      </UiText>
                    </UiInline>
                  </NuxtLink>
                </li>
              </ul>
              <UiEmptyState
                v-else
                title="No implemented plans match your filters"
                description="Adjust filters or search to find implemented plans."
              />
            </UiStack>
          </UiSurface>

          <UiSurface variant="panel" class="plan-index__list plan-index__list--archive">
            <UiStack :gap="'var(--space-sm)'">
              <UiInline :gap="'var(--space-xs)'" :align="'center'" class="plan-index__list-heading">
                <UiHeading :level="2" size="h4">Canceled plans</UiHeading>
                <UiBadge :value="canceledPlans.length" variant="muted" />
              </UiInline>
              <UiText variant="muted">
                Plans intentionally abandoned or superseded (`canceled`).
              </UiText>
              <ul v-if="canceledPlans.length" class="plan-index__items">
                <li v-for="plan in canceledPlans" :key="plan.id">
                  <NuxtLink :to="resolvePlanHref(plan)" class="plan-card plan-card--archive">
                    <UiInline class="plan-card__meta" :gap="'var(--space-xs)'" :align="'center'">
                      <UiHeading :level="3" size="h5">{{ plan.title }}</UiHeading>
                      <UiBadge :variant="resolveStatusVariant(plan.status)">
                        {{ formatStatusLabel(plan.status) }}
                      </UiBadge>
                      <UiBadge variant="muted">{{ formatTierLabel(plan.tier) }}</UiBadge>
                      <UiBadge variant="muted">Owner · {{ plan.owner ?? 'Unassigned' }}</UiBadge>
                    </UiInline>
                    <UiText class="plan-card__summary" variant="muted">
                      {{ plan.summary || 'No summary provided yet.' }}
                    </UiText>
                    <UiInline class="plan-card__footer" :gap="'var(--space-sm)'" :align="'center'">
                      <UiText variant="muted">Updated {{ formatUpdated(plan.lastUpdated) }}</UiText>
                      <UiText v-if="plan.path" variant="muted" class="plan-card__path">
                        {{ plan.path }}
                      </UiText>
                    </UiInline>
                  </NuxtLink>
                </li>
              </ul>
              <UiEmptyState
                v-else
                title="No canceled plans match your filters"
                description="Adjust filters or search to find canceled plans."
              />
            </UiStack>
          </UiSurface>
        </div>
      </template>
    </section>
  </PageShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Plan, PlansCmsResponse, PlansResponse } from '@astralpirates/shared/api-contracts';
import { PlansCmsResponseSchema } from '@astralpirates/shared/api-contracts';
import { normalizePlansCmsResponse } from '@astralpirates/shared/plans';

import PageShell from '~/components/PageShell.vue';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiEmptyState,
  UiHeading,
  UiInline,
  UiSelect,
  UiStack,
  UiSurface,
  UiText,
  UiTextInput,
} from '~/components/ui';
import { requestAuthDialog } from '~/composables/useAuthDialog';
import { useAstralFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';

const statusLabelMap: Record<string, string> = {
  shipped: 'Shipped',
  tested: 'Tested',
  canceled: 'Canceled',
};

const statusVariantMap: Record<string, 'muted' | 'info' | 'success'> = {
  shipped: 'success',
  tested: 'muted',
  canceled: 'muted',
};

const tierLabelMap: Record<string, string> = {
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
  tier4: 'Tier 4',
  tier5: 'Tier 5',
  platform: 'Platform',
  support: 'Support/Reference',
  meta: 'Meta',
};

const session = useSessionStore();
const sessionReady = computed(() => session.initialised);
const isAuthenticated = computed(() => session.isAuthenticated);

const formatStatusLabel = (value: string) => statusLabelMap[value] ?? value;
const resolveStatusVariant = (value: string) => statusVariantMap[value] ?? 'muted';
const formatTierLabel = (value: string | null | undefined) =>
  value && tierLabelMap[value] ? tierLabelMap[value] : value ?? 'Unknown tier';
const formatUpdated = (value?: string | null) => value || 'Not recorded';
const resolvePlanHref = (plan: Plan) => `/gangway/engineering/control/plans/${plan.slug ?? plan.id}`;

const shouldFetchPlans = computed(() => session.isAuthenticated);

const { data: plansResponse, error: plansError } = await useAstralFetch<PlansResponse, PlansCmsResponse>('/api/plans', {
  key: () => 'control-archive',
  query: { limit: '200', depth: '1', sort: 'planId' },
  schema: PlansCmsResponseSchema,
  transform: (payload) => normalizePlansCmsResponse(payload),
  default: () => ({ generatedAt: null, plans: [] }),
  immediate: shouldFetchPlans.value,
  watch: [shouldFetchPlans, () => session.bearerToken],
});

const plansGeneratedAtLabel = computed(() =>
  isAuthenticated.value ? formatSnapshotTimestamp(plansResponse.value?.generatedAt) : null,
);

const plans = computed<Plan[]>(() =>
  isAuthenticated.value ? plansResponse.value?.plans ?? [] : [],
);

const search = ref('');
const statusFilter = ref<string>('all');
const tierFilter = ref<string>('all');

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Tested', value: 'tested' },
  { label: 'Canceled', value: 'canceled' },
];

const tierOptions = [
  { label: 'All tiers', value: 'all' },
  { label: 'Tier 1', value: 'tier1' },
  { label: 'Tier 2', value: 'tier2' },
  { label: 'Tier 3', value: 'tier3' },
  { label: 'Tier 4', value: 'tier4' },
  { label: 'Tier 5', value: 'tier5' },
  { label: 'Platform', value: 'platform' },
  { label: 'Support/Reference', value: 'support' },
  { label: 'Meta', value: 'meta' },
];

const matchesFilters = (plan: Plan) => {
  if (!isArchivedPlan(plan)) return false;
  const text = search.value.trim().toLowerCase();
  const matchesSearch =
    !text ||
    plan.title.toLowerCase().includes(text) ||
    (plan.owner ?? '').toLowerCase().includes(text) ||
    (plan.summary ?? '').toLowerCase().includes(text);
  const matchesStatus = statusFilter.value === 'all' || plan.status === statusFilter.value;
  const matchesTier = tierFilter.value === 'all' || plan.tier === tierFilter.value;
  return matchesSearch && matchesStatus && matchesTier;
};

const planTitleCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const filteredPlans = computed(() =>
  plans.value
    .filter(matchesFilters)
    .slice()
    .sort((a, b) => planTitleCollator.compare(a.title, b.title)),
);

const isArchivedPlan = (plan: Plan) =>
  plan.status === 'shipped' || plan.status === 'tested' || plan.status === 'canceled';
const implementedPlans = computed(() =>
  filteredPlans.value.filter((plan) => plan.status === 'shipped' || plan.status === 'tested'),
);
const canceledPlans = computed(() => filteredPlans.value.filter((plan) => plan.status === 'canceled'));

const openAuthDialog = () => {
  requestAuthDialog();
};

function formatSnapshotTimestamp(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return `${timestamp.toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
}
</script>

<style scoped>
.plan-index {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.plan-index__intro strong {
  font-weight: var(--font-weight-semibold);
}

.plan-index__badges {
  flex-wrap: wrap;
}

.plan-index__filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.plan-index__guard {
  margin-top: var(--space-md);
}

.plan-index__filter-row {
  flex-wrap: wrap;
}

.plan-index__filter {
  min-width: calc(var(--size-base-layout-px) * 240 * var(--size-scale-factor));
  flex: 1 1 0;
}

.plan-index__lists {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.plan-index__list {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.plan-index__list-heading {
  flex-wrap: wrap;
}

.plan-index__items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.plan-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  border: var(--size-base-layout-px) solid var(--color-border-strong);
  text-decoration: none;
  background: var(--color-surface-secondary);
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.plan-card:hover,
.plan-card:focus-visible {
  border-color: var(--color-accent-primary);
  transform: translateY(calc(var(--size-base-layout-px) * -2 * var(--size-scale-factor)));
}

.plan-card__meta {
  flex-wrap: wrap;
}

.plan-card__summary {
  line-height: 1.5;
}

.plan-card__footer {
  flex-wrap: wrap;
  font-size: calc(var(--size-base-space-rem) * 0.95);
}

.plan-card__path {
  font-family: var(--font-family-mono);
}

.plan-card--archive {
  background: var(--color-surface-tertiary);
}
</style>
