<template>
  <PageShell page-path="gangway/engineering/control" :page-data="page ?? null">
    <PageRenderer v-if="page" :blocks="page?.layout ?? []" :parent-access-policy="page?.accessPolicy ?? null" :owner-id="page?.owner?.id ?? null" />

    <section v-if="changelogAccordionItems.length" class="control-changelog">
      <UiStack as="header" class="control-changelog__intro" :gap="'var(--space-sm)'">
        <UiHeading :level="2">Mission Control · Changelog</UiHeading>
        <UiText>
          Deployment notes pulled from
          <a :href="changelogLink" target="_blank" rel="noopener">CHANGELOG.md</a>.
          Refreshed via <code>pnpm plan:status</code> whenever deployments run.
        </UiText>
        <UiText
          v-if="changelogGeneratedAtLabel"
          variant="muted"
          class="control-changelog__timestamp"
        >
          Snapshot generated {{ changelogGeneratedAtLabel }}.
        </UiText>
      </UiStack>

      <UiSurface variant="panel" class="control-changelog__panel">
        <UiAccordion
          class="control-changelog__items"
          :items="changelogAccordionItems"
          multiple
          :default-open="changelogDefaultOpen"
        >
          <template #title="{ item }">
            <UiInline class="control-changelog__item-header" :gap="'var(--space-xs)'" :align="'center'">
              <UiHeading :level="3" size="h4">Release {{ asChangelogItem(item).versionLabel }}</UiHeading>
              <UiBadge
                size="sm"
                variant="muted"
                :value="asChangelogItem(item).entries.length"
                :aria-label="`${asChangelogItem(item).entries.length} changes in release ${asChangelogItem(item).versionLabel}`"
              />
            </UiInline>
          </template>
          <template #item="{ item }">
            <ul class="control-changelog__entry-list">
              <li v-for="entry in asChangelogItem(item).entries" :key="entry">{{ entry }}</li>
            </ul>
          </template>
        </UiAccordion>
      </UiSurface>
    </section>

    <section class="control-roadmap">
      <UiStack as="header" class="control-roadmap__intro" :gap="'var(--space-sm)'">
        <UiHeading :level="2">Mission Control · Roadmap</UiHeading>
        <UiText>
          Served from the CMS roadmap tiers seeded from
          <a :href="roadmapLink" target="_blank" rel="noopener">docs/planning/roadmap-priorities.md</a>.
          Refreshed via <code>pnpm plan:status</code> with a bundled fallback.
        </UiText>
        <UiText>
          Shipped, tested, and canceled plans move into the archive list —
          <NuxtLink :to="planArchiveHref" class="control-roadmap__archive-link">view the archive</NuxtLink>.
        </UiText>
        <UiText
          v-if="roadmapGeneratedAtLabel"
          variant="muted"
          class="control-roadmap__timestamp"
        >
          Snapshot generated {{ roadmapGeneratedAtLabel }}.
        </UiText>
        <UiInline class="control-roadmap__cta" :gap="'var(--space-xs)'">
          <UiLinkButton to="/gangway/engineering/control/archive" variant="secondary" size="sm">
            View archive (login required)
          </UiLinkButton>
        </UiInline>
      </UiStack>

      <UiSurface v-if="!sessionReady" variant="panel" class="control-roadmap__guard">
        <UiStack :gap="'var(--space-xs)'">
          <UiHeading :level="3" size="h5">Checking access…</UiHeading>
          <UiText variant="muted">Confirming your session before loading roadmap details.</UiText>
        </UiStack>
      </UiSurface>

      <UiSurface v-else-if="!canViewRoadmapDetails" variant="panel" class="control-roadmap__guard">
        <UiStack :gap="'var(--space-sm)'">
          <UiHeading :level="3" size="h5">Crew access required</UiHeading>
          <UiText variant="muted">
            Log in to view roadmap tiers and plan details.
          </UiText>
          <UiButton @click="openAuthDialog">Embark to view roadmap</UiButton>
        </UiStack>
      </UiSurface>

      <div v-else class="control-roadmap__tiers">
        <UiSurface
          v-for="tier in visibleRoadmapTiers"
          :key="tier.id"
          class="control-roadmap__tier"
          variant="panel"
        >
          <UiStack :gap="'var(--space-xs)'" class="control-roadmap__tier-header">
            <UiInline :gap="'var(--space-xs)'" :align="'center'">
              <UiHeading :level="3" size="h4">{{ tier.title }}</UiHeading>
              <UiBadge
                size="sm"
                variant="muted"
                :value="tier.items.length"
                :aria-label="`${tier.items.length} roadmap items`"
              />
            </UiInline>
            <UiText v-if="tier.description" variant="muted">{{ tier.description }}</UiText>
          </UiStack>

          <UiAccordion :items="toAccordionItems(tier)" multiple class="control-roadmap__items">
            <template #title="{ item }">
              <UiInline class="control-roadmap__item-meta" :gap="'var(--space-xs)'">
                <UiBadge
                  size="sm"
                  :variant="resolveStatusVariant(asRoadmapItem(item).status)"
                  :aria-label="`Status: ${formatStatusLabel(asRoadmapItem(item).status)}`"
                >
                  {{ formatStatusLabel(asRoadmapItem(item).status) }}
                </UiBadge>
                <UiBadge
                  size="sm"
                  :variant="resolveCloudVariant(asRoadmapItem(item).cloudStatus)"
                  :aria-label="`Cloud: ${formatCloudLabel(asRoadmapItem(item).cloudStatus)}`"
                >
                  {{ formatCloudLabel(asRoadmapItem(item).cloudStatus) }}
                </UiBadge>
                <span class="control-roadmap__item-title">{{ asRoadmapItem(item).rawTitle }}</span>
              </UiInline>
            </template>
            <template #item="{ item }">
              <div class="control-roadmap__item">
                <UiText
                  v-if="asRoadmapItem(item).updatedEyebrow"
                  variant="muted"
                  class="ui-text ui-text--muted control-roadmap__item-updated"
                >
                  {{ asRoadmapItem(item).updatedEyebrow }}
                </UiText>
                <UiText
                  v-if="asRoadmapItem(item).summary"
                  variant="muted"
                  class="ui-text ui-text--muted control-roadmap__item-summary"
                >
                  {{ asRoadmapItem(item).summary }}
                </UiText>
                <UiInline class="control-roadmap__item-links" :gap="'var(--space-xs)'">
                  <a
                    v-if="asRoadmapItem(item).referenceUrl"
                    class="control-roadmap__item-link"
                    :href="asRoadmapItem(item).referenceUrl ?? undefined"
                    target="_blank"
                    rel="noopener"
                  >
                    {{ asRoadmapItem(item).referenceLabel ?? 'Reference' }}
                  </a>
                  <a
                    v-if="asRoadmapItem(item).plan"
                    class="control-roadmap__item-link control-roadmap__item-link--doc"
                    :href="resolvePlanUrl(asRoadmapItem(item).plan)"
                    target="_blank"
                    rel="noopener"
                  >
                    Plan · {{ asRoadmapItem(item).plan?.title }}
                  </a>
                </UiInline>
                <UiText v-if="asRoadmapItem(item).plan" variant="muted" class="control-roadmap__item-owner">
                  Owner: {{ asRoadmapItem(item).plan?.owner }}
                </UiText>
              </div>
            </template>
          </UiAccordion>
        </UiSurface>
      </div>
    </section>
  </PageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  RoadmapItem,
  RoadmapPlan,
  RoadmapResponse,
  RoadmapTier,
} from '@astralpirates/shared/api-contracts';
import { RoadmapResponseSchema } from '@astralpirates/shared/api-contracts';
import { canReadWithAccessPolicy, type AccessPolicy } from '@astralpirates/shared/accessPolicy';
import { CREW_ROLE_SET, type CrewRole } from '@astralpirates/shared/crewRoles';
import { formatTimestamp } from '@astralpirates/shared/logs';

import PageShell from '~/components/PageShell.vue';
import PageRenderer from '~/components/PageRenderer.vue';
import {
  UiAccordion,
  UiBadge,
  UiButton,
  UiHeading,
  UiInline,
  UiLinkButton,
  UiStack,
  UiSurface,
  UiText,
} from '~/components/ui';
import { requestAuthDialog } from '~/composables/useAuthDialog';
import { usePageContent } from '~/composables/usePageContent';
import { useAstralFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';
import changelogSnapshot from '~/generated/changelog.json' with { type: 'json' };

const roadmapLink =
  'https://github.com/astralpirates/astralpirates.com/blob/main/docs/planning/roadmap-priorities.md';
const changelogLink = 'https://github.com/astralpirates/astralpirates.com/blob/main/CHANGELOG.md';
const planArchiveHref = '/gangway/engineering/control/archive';

type ChangelogRelease = {
  id: string;
  version: string;
  title: string;
  entries: string[];
};

type ChangelogData = {
  generatedAt?: string;
  releases: ChangelogRelease[];
};

type ChangelogAccordionItem = ChangelogRelease & {
  versionLabel: string;
};

type RoadmapAccordionItem = RoadmapItem & {
  rawTitle: string;
  title: string;
  updatedEyebrow: string | null;
};

type RoadmapTimestampPlan = RoadmapPlan & {
  lastUpdated?: string | null;
  statusChangedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const asChangelogItem = (item: unknown) => item as ChangelogAccordionItem;
const asRoadmapItem = (item: unknown) => item as RoadmapAccordionItem;

const emptyRoadmap: RoadmapResponse = {
  generatedAt: null,
  tiers: [],
};
const roadmapDetailsPolicy: AccessPolicy = {
  mode: 'role',
  roleSpace: 'crew',
  minimumRole: 'swabbie',
};
const session = useSessionStore();
const sessionReady = computed(() => session.initialised);
const isAuthenticated = computed(() => session.isAuthenticated);
const currentCrewRole = computed<CrewRole | null>(() => {
  const role = session.currentUser?.role;
  if (typeof role !== 'string') return null;
  const normalized = role.trim().toLowerCase();
  if (!CREW_ROLE_SET.has(normalized as CrewRole)) return null;
  return normalized as CrewRole;
});
const canViewRoadmapDetails = computed(() =>
  canReadWithAccessPolicy(roadmapDetailsPolicy, {
    isAuthenticated: isAuthenticated.value,
    userId: session.currentUser?.id ?? null,
    crewRole: currentCrewRole.value ?? (isAuthenticated.value ? 'swabbie' : null),
  }),
);
const shouldFetchRoadmap = computed(() => canViewRoadmapDetails.value);

const {
  data: roadmapResponse,
  error: roadmapError,
} = await useAstralFetch<RoadmapResponse>('/api/roadmap', {
  key: () => 'control-roadmap',
  schema: RoadmapResponseSchema,
  requiresAuth: true,
  authOptional: true,
  default: () => emptyRoadmap,
  immediate: shouldFetchRoadmap.value,
  watch: [shouldFetchRoadmap, () => session.bearerToken],
});

if (roadmapError.value && shouldFetchRoadmap.value) {
  // eslint-disable-next-line no-console
  console.warn('[pages/gangway/engineering/control] Failed to load roadmap data', roadmapError.value);
}

const roadmapData = computed<RoadmapResponse>(() => {
  if (!shouldFetchRoadmap.value) return emptyRoadmap;
  return roadmapResponse.value ?? emptyRoadmap;
});
const roadmapTiers = computed<RoadmapTier[]>(() => roadmapData.value?.tiers ?? []);
const visibleRoadmapTiers = computed<RoadmapTier[]>(() =>
  roadmapTiers.value
    .map((tier) => ({
      ...tier,
      items: tier.items.filter(
        (item) =>
          item.status !== 'shipped' && item.status !== 'tested' && item.status !== 'canceled',
      ),
    }))
    .filter((tier) => tier.items.length > 0),
);
const changelogData = changelogSnapshot as ChangelogData;
const changelogReleases = computed<ChangelogRelease[]>(() => changelogData?.releases ?? []);
const changelogAccordionItems = computed<ChangelogAccordionItem[]>(() =>
  changelogReleases.value.map((release) => ({
    ...release,
    title: release.title || release.version,
    versionLabel: release.title || release.version,
    entries: release.entries ?? [],
  })),
);
const changelogDefaultOpen = computed(() => {
  const [first] = changelogAccordionItems.value;
  return first ? [first.id] : [];
});

const statusLabelMap: Record<string, string> = {
  shipped: 'Shipped',
  active: 'In flight',
  queued: 'Queued',
  tested: 'Tested',
  canceled: 'Canceled',
};

const cloudLabelMap: Record<string, string> = {
  healthy: 'Cloud healthy',
  deploying: 'Deploying',
  pending: 'Cloud pending',
};

const statusVariantMap: Record<string, 'success' | 'info' | 'muted'> = {
  shipped: 'success',
  active: 'info',
  queued: 'muted',
  tested: 'muted',
  canceled: 'muted',
};

const cloudVariantMap: Record<string, 'success' | 'warning' | 'muted'> = {
  healthy: 'success',
  deploying: 'warning',
  pending: 'muted',
};

const formatStatusLabel = (value: string) => statusLabelMap[value] ?? value;
const formatCloudLabel = (value?: string | null) => (value ? cloudLabelMap[value] ?? value : 'Unknown');
const resolveStatusVariant = (value: string) => statusVariantMap[value] ?? 'muted';
const resolveCloudVariant = (value?: string | null) =>
  value ? cloudVariantMap[value] ?? 'muted' : 'muted';
const formatAccordionTitle = (item: RoadmapItem) => item.title;

const parseIsoTimestamp = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

const parseDateOnlyTimestamp = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return parseIsoTimestamp(trimmed);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if ([year, month, day].some((part) => Number.isNaN(part))) return null;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
};

const resolvePlanTimestamp = (plan?: RoadmapTimestampPlan | null): Date | null => {
  if (!plan) return null;
  return (
    parseIsoTimestamp(plan.statusChangedAt) ||
    parseIsoTimestamp(plan.updatedAt) ||
    parseIsoTimestamp(plan.createdAt) ||
    parseDateOnlyTimestamp(plan.lastUpdated)
  );
};

const formatRoadmapItemUpdatedEyebrow = (item: RoadmapItem): string | null => {
  const livePlan = (item.plan as RoadmapTimestampPlan | null | undefined) ?? null;
  const timestamp = resolvePlanTimestamp(livePlan);
  if (!timestamp) return null;
  return `Updated: ${formatTimestamp(timestamp)}`;
};

const toAccordionItems = (tier: RoadmapTier): RoadmapAccordionItem[] =>
  tier.items.map((item) => ({
    ...item,
    rawTitle: item.title,
    title: formatAccordionTitle(item),
    updatedEyebrow: formatRoadmapItemUpdatedEyebrow(item),
  }));

const roadmapDocBase = 'https://github.com/astralpirates/astralpirates.com/blob/main/';
const resolvePlanUrl = (plan?: RoadmapPlan | null) => {
  if (!plan) return roadmapLink;
  const path = typeof plan.path === 'string' ? plan.path.trim() : '';
  if (!path) return roadmapLink;
  if (/^https?:\/\//i.test(path)) return path;
  const relativePath = path.replace(/^\//, '');
  return `${roadmapDocBase}${relativePath}`;
};

const formatSnapshotTimestamp = (value?: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return `${timestamp.toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
};

const roadmapGeneratedAtLabel = computed(() => formatSnapshotTimestamp(roadmapData.value?.generatedAt));
const changelogGeneratedAtLabel = computed(() => formatSnapshotTimestamp(changelogData?.generatedAt));

const { data: pageRef, error } = usePageContent({ path: 'gangway/engineering/control' });

if (error.value) {
  // eslint-disable-next-line no-console
  console.error('[pages/gangway/engineering/control] Failed to load page content', error.value);
}

if (!pageRef.value) {
  // eslint-disable-next-line no-console
  console.warn(
    '[pages/gangway/engineering/control] No page content returned for gangway/engineering/control',
  );
}

const page = computed(() => pageRef.value ?? null);

const openAuthDialog = () => {
  requestAuthDialog();
};
</script>

<style scoped>
.control-changelog {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-top: var(--space-xl);
}

.control-changelog__intro a {
  color: var(--color-accent-primary);
  text-decoration: underline;
}

.control-changelog__timestamp {
  font-size: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));
}

.control-changelog__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.control-changelog__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.control-changelog__item-header {
  flex-wrap: wrap;
}

.control-changelog__entry-list {
  margin: 0;
  padding-left: calc(var(--size-base-space-rem) * 1.1 * var(--size-scale-factor));
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  color: var(--color-text-secondary);
}

.control-roadmap {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  margin-top: var(--space-xl);
}

.control-roadmap__intro a {
  color: var(--color-accent-primary);
  text-decoration: underline;
}

.control-roadmap__timestamp {
  font-size: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));
}

.control-roadmap__archive-link {
  color: var(--color-accent-primary);
  text-decoration: underline;
}

.control-roadmap__cta {
  flex-wrap: wrap;
}

.control-roadmap__guard {
  margin-top: var(--space-sm);
}

.control-roadmap__tiers {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.control-roadmap__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.control-roadmap__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.control-roadmap__item-updated {
  font-size: calc(var(--size-base-space-rem) * 0.72 * var(--size-scale-factor));
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.5);
  text-transform: uppercase;
  font-weight: var(--font-weight-semibold);
}

.control-roadmap__item-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.control-roadmap__item-title {
  font-weight: var(--font-weight-semibold);
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.25);
  text-transform: uppercase;
}

.control-roadmap__item-meta {
  flex-wrap: wrap;
}

.control-roadmap__item-link {
  font-size: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
  text-transform: uppercase;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  color: var(--color-accent-secondary);
  text-decoration: none;
}

.control-roadmap__item-link + .control-roadmap__item-link {
  margin-left: var(--space-xs);
}

.control-roadmap__item-owner {
  font-size: calc(var(--size-base-space-rem) * 0.8 * var(--size-scale-factor));
}

.control-roadmap__item-link:hover,
.control-roadmap__item-link:focus-visible {
  text-decoration: underline;
}
</style>
