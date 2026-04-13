<template>
<UiSurface class="log-summary-card u-section" variant="panel" :padding="null">
    <div class="log-summary-card__body">
      <NuxtLink :to="href" class="log-summary-card__headline log-summary-card__copy">
        <UiText variant="eyebrow" class="log-summary-card__stamp">{{ logStampText }}</UiText>
        <UiHeading :level="3" size="h4" :uppercase="false">
          <template v-if="logHeadline">
            {{ logHeadline }}
          </template>
          <template v-else>
            Log entry
          </template>
        </UiHeading>
      </NuxtLink>
      <UiText v-if="missionLabel" variant="muted" class="log-summary-card__mission">
        {{ missionLabel }}
      </UiText>
    </div>
    <div class="log-summary-card__meta">
      <div class="log-summary-card__identity">
        <CrewAvatarStack v-if="hasOwner" :crew="ownerCrew" size="sm" />
        <UiText
          v-else
          variant="caption"
          class="log-summary-card__anonymous log-summary-card__identity--anonymous log-summary-card__anonymous-label"
        >
          Unknown crew
        </UiText>
      </div>
      <UiInline v-if="missionHref" class="log-summary-card__actions log-summary-card__cta" :gap="'var(--space-sm)'">
        <UiLinkButton :to="missionHref" variant="secondary" size="sm">
          View mission
        </UiLinkButton>
      </UiInline>
    </div>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveLogHref } from '@astralpirates/shared/logs';
import CrewAvatarStack from '~/components/CrewAvatarStack.vue';
import type { LogSummary } from '~/modules/api/schemas';
import { UiHeading, UiInline, UiLinkButton, UiSurface, UiText } from '~/components/ui';

const props = defineProps<{
  log: LogSummary;
  mission?: {
    title?: string | null;
    location?: string | null;
    displayDate?: string | null;
    href?: string | null;
  } | null;
}>();

const hasOwner = computed(() => Boolean(props.log.owner));

const href = computed(() => resolveLogHref(props.log));

const logStampText = computed(() => {
  const stamp = props.log.dateCode?.trim() || props.log.slug?.trim();
  return stamp ? `LOG ${stamp}` : 'LOG ENTRY';
});

const logHeadline = computed(() => props.log.headline?.trim() || null);

const ownerCrew = computed(() => {
  return props.log.owner ? [props.log.owner] : [];
});

const missionLabel = computed(() => {
  const mission = props.mission ?? null;
  if (mission) {
    const parts: string[] = [];
    const title = mission.title?.trim();
    if (title) parts.push(title);
    const location = mission.location?.trim();
    if (location) parts.push(location);
    const date = mission.displayDate?.trim();
    if (date && !parts.includes(date)) parts.push(date);
    if (!parts.length) return '';
    return `Flight plan: ${parts.join(' • ')}`;
  }

  const tombstone = props.log.flightPlanTombstone ?? null;
  if (!tombstone) return '';
  const parts: string[] = [];
  const title = tombstone.title?.trim();
  if (title) parts.push(title);
  const location = tombstone.location?.trim();
  if (location) parts.push(location);
  const date = tombstone.displayDate?.trim();
  if (date && !parts.includes(date)) parts.push(date);
  if (!parts.length) return 'Former flight plan';
  return `Former flight plan: ${parts.join(' • ')}`;
});

const missionHref = computed(() => {
  const mission = props.mission ?? null;
  const href = mission?.href?.trim();
  if (!href) return null;
  return href.startsWith('/') ? href : `/${href.replace(/^\/+/, '')}`;
});
</script>

<style scoped>
.log-summary-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.log-summary-card__headline {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.log-summary-card__mission {
  margin: 0;
}

.log-summary-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.log-summary-card__identity {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.log-summary-card__anonymous {
  text-transform: uppercase;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
}

.log-summary-card__actions {
  margin-left: auto;
}
</style>
