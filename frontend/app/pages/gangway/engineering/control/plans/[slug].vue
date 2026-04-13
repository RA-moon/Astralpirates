<template>
  <PageShell :page-path="`gangway/engineering/control/plans/${slug}`" :page-data="null">
    <section class="plan-detail">
      <UiStack :gap="'var(--space-sm)'">
        <UiInline :gap="'var(--space-sm)'" class="plan-detail__breadcrumbs" :align="'center'">
          <NuxtLink to="/gangway/engineering/control/plans" class="plan-detail__crumb">Plans</NuxtLink>
          <span aria-hidden="true">/</span>
          <span class="plan-detail__crumb plan-detail__crumb--current">{{ plan?.title ?? 'Plan' }}</span>
        </UiInline>

        <UiSurface v-if="!sessionReady" variant="panel" class="plan-detail__guard">
          <UiStack :gap="'var(--space-xs)'">
            <UiHeading :level="2" size="h4">Checking access…</UiHeading>
            <UiText variant="muted">Confirming your session before loading this plan.</UiText>
          </UiStack>
        </UiSurface>

        <UiSurface v-else-if="!isAuthenticated" variant="panel" class="plan-detail__guard">
          <UiStack :gap="'var(--space-sm)'">
            <UiHeading :level="2" size="h4">Crew access required</UiHeading>
            <UiText variant="muted">
              Log in to view plan details and reference links. Access stays gated to logged-in crew.
            </UiText>
            <UiButton @click="openAuthDialog">
              Embark to view plan
            </UiButton>
          </UiStack>
        </UiSurface>

        <UiStack v-else-if="plan" :gap="'var(--space-sm)'">
          <UiInline class="plan-detail__header" :gap="'var(--space-sm)'" :align="'center'">
            <UiHeading :level="1" size="h2">{{ plan.title }}</UiHeading>
            <UiBadge :variant="resolveStatusVariant(plan.status)">
              {{ formatStatusLabel(plan.status) }}
            </UiBadge>
            <UiBadge variant="muted">{{ formatTierLabel(plan.tier) }}</UiBadge>
          </UiInline>

          <UiInline class="plan-detail__meta" :gap="'var(--space-sm)'" :align="'center'">
            <UiBadge variant="muted">Owner · {{ plan.owner ?? 'Unassigned' }}</UiBadge>
            <UiBadge variant="muted">Updated {{ formatUpdated(plan.lastUpdated) }}</UiBadge>
            <UiBadge v-if="plan.cloudStatus" variant="muted">
              Cloud · {{ plan.cloudStatus }}
            </UiBadge>
          </UiInline>

          <UiSurface variant="panel" class="plan-detail__summary">
            <UiText variant="muted">
              {{ plan.summary || 'No summary provided.' }}
            </UiText>
            <UiInline v-if="plan.path || plan.links?.length" :gap="'var(--space-sm)'" class="plan-detail__links">
              <a v-if="plan.path" :href="resolvePlanDocHref(plan)" target="_blank" rel="noopener" class="plan-detail__link">
                View source doc
              </a>
              <a
                v-for="link in plan.links"
                :key="link.url"
                :href="link.url"
                target="_blank"
                rel="noopener"
                class="plan-detail__link"
              >
                {{ link.label }}
              </a>
            </UiInline>
          </UiSurface>

          <UiSurface variant="panel" class="plan-detail__body">
            <UiHeading :level="2" size="h4">Details</UiHeading>
            <RichTextRenderer
              v-if="plan.body && plan.body.length"
              :content="plan.body"
              class="plan-detail__richtext"
            />
            <UiText v-else variant="muted">This plan has no detailed body yet.</UiText>
          </UiSurface>

          <UiSurface v-if="planRunLogs.length" variant="panel" class="plan-detail__run-logs">
            <UiHeading :level="2" size="h4">Run logs</UiHeading>
            <UiStack :gap="'var(--space-xs)'" class="plan-detail__run-log-list">
              <UiInline
                v-for="entry in planRunLogs"
                :key="entry.path"
                :gap="'var(--space-xs)'"
                :align="'center'"
              >
                <UiText variant="muted" class="plan-detail__run-log-date">
                  {{ formatRunLogDate(entry.date) }}
                </UiText>
                <a :href="resolveRunLogHref(entry)" target="_blank" rel="noopener" class="plan-detail__link">
                  {{ entry.title }}
                </a>
              </UiInline>
            </UiStack>
          </UiSurface>
        </UiStack>

        <UiEmptyState
          v-else
          title="Plan not found"
          description="This plan is not available. Return to the plan list to continue."
        >
          <template #actions>
            <NuxtLink to="/gangway/engineering/control/plans" class="plan-detail__link">
              Back to plans
            </NuxtLink>
          </template>
        </UiEmptyState>
      </UiStack>
    </section>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '#app';
import type {
  Plan,
  PlanDetailResponse,
  PlansCmsResponse,
} from '@astralpirates/shared/api-contracts';
import { PlansCmsResponseSchema } from '@astralpirates/shared/api-contracts';
import { normalizePlanDetail, normalizePlansCmsResponse } from '@astralpirates/shared/plans';

import PageShell from '~/components/PageShell.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import {
  UiBadge,
  UiButton,
  UiEmptyState,
  UiHeading,
  UiInline,
  UiStack,
  UiSurface,
  UiText,
} from '~/components/ui';
import { requestAuthDialog } from '~/composables/useAuthDialog';
import { useAstralFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ''));
const planDocBase = 'https://github.com/astralpirates/astralpirates.com/blob/main/';
const session = useSessionStore();
const sessionReady = computed(() => session.initialised);
const isAuthenticated = computed(() => session.isAuthenticated);
type PlanRunLogItem = NonNullable<Plan['runLogs']>[number];

const statusLabelMap: Record<string, string> = {
  queued: 'Queued',
  active: 'In flight',
  shipped: 'Shipped',
  tested: 'Tested',
  canceled: 'Canceled',
};

const statusVariantMap: Record<string, 'muted' | 'info' | 'success'> = {
  queued: 'muted',
  active: 'info',
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

const formatStatusLabel = (value: string) => statusLabelMap[value] ?? value;
const resolveStatusVariant = (value: string) => statusVariantMap[value] ?? 'muted';
const formatTierLabel = (value: string | null | undefined) =>
  value && tierLabelMap[value] ? tierLabelMap[value] : value ?? 'Unknown tier';
const formatUpdated = (value?: string | null) => value || 'Not recorded';
const formatRunLogDate = (value?: string | null) => value || 'Unknown date';

const resolvePlanDocHref = (plan: Plan) => {
  const path = typeof plan.path === 'string' ? plan.path.trim() : '';
  if (!path) return planDocBase;
  if (/^https?:\/\//i.test(path)) return path;
  const relative = path.replace(/^\//, '');
  return `${planDocBase}${relative}`;
};

const resolveRunLogHref = (entry: PlanRunLogItem) => {
  const path = entry.path?.trim();
  if (!path) return planDocBase;
  if (/^https?:\/\//i.test(path)) return path;
  const relative = path.replace(/^\//, '');
  return `${planDocBase}${relative}`;
};

const shouldFetchPlan = computed(() => session.isAuthenticated);

const planQuery = computed(() => ({
  limit: '1',
  depth: '1',
  'where[or][0][slug][equals]': slug.value,
  'where[or][1][planId][equals]': slug.value,
}));

const { data } = await useAstralFetch<PlanDetailResponse, PlansCmsResponse>('/api/plans', {
  key: () => `plan-detail-${slug.value}`,
  query: planQuery,
  schema: PlansCmsResponseSchema,
  transform: (payload) => {
    const normalized = normalizePlansCmsResponse(payload);
    const plan = normalized.plans[0] ?? null;
    return normalizePlanDetail(plan);
  },
  default: () => normalizePlanDetail(null),
  immediate: shouldFetchPlan.value,
  watch: [shouldFetchPlan, () => session.bearerToken, slug],
});

const plan = computed(() => (isAuthenticated.value ? data.value?.plan ?? null : null));
const planRunLogs = computed(() => plan.value?.runLogs ?? []);

const openAuthDialog = () => {
  requestAuthDialog();
};
</script>

<style scoped>
.plan-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.plan-detail__breadcrumbs {
  flex-wrap: wrap;
  color: var(--color-text-secondary);
}

.plan-detail__crumb {
  color: var(--color-text-secondary);
  text-decoration: none;
}

.plan-detail__crumb--current {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.plan-detail__header {
  flex-wrap: wrap;
}

.plan-detail__meta {
  flex-wrap: wrap;
}

.plan-detail__links {
  flex-wrap: wrap;
  margin-top: var(--space-sm);
}

.plan-detail__guard {
  margin-top: var(--space-sm);
}

.plan-detail__link {
  color: var(--color-accent-primary);
  text-decoration: underline;
  font-weight: var(--font-weight-medium);
}

.plan-detail__richtext {
  margin-top: var(--space-sm);
}

.plan-detail__run-log-list {
  margin-top: var(--space-sm);
}

.plan-detail__run-log-date {
  min-width: calc(var(--size-base-space-rem) * 6.5);
}
</style>
