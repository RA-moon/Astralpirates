<template>
  <section class="container page log-entry-page">
    <UiSurface v-if="pending" class="log-entry-page__state" variant="panel" role="status">
      <UiText>Loading log entry…</UiText>
    </UiSurface>

    <UiSurface v-else-if="errorMessage" class="log-entry-page__state" variant="panel">
      <UiText>{{ errorMessage }}</UiText>
      <UiLinkButton variant="secondary" to="/bridge/logbook">Back to logbook</UiLinkButton>
    </UiSurface>

    <UiSurface v-else-if="log" class="log-entry" variant="panel">
      <UiStack :gap="'var(--space-lg)'">
        <header class="log-entry__header">
          <UiText variant="eyebrow">Captain's log</UiText>
          <UiHeading :level="1" size="display" class="log-entry__title">
            <span class="log-entry__code">{{ logStampText }}</span>
            <template v-if="logHeadline">
              <span class="log-entry__separator" aria-hidden="true"> – </span>
              <em class="log-entry__headline">{{ logHeadline }}</em>
            </template>
          </UiHeading>
          <UiText v-if="metaLine" class="log-entry__meta">{{ metaLine }}</UiText>
          <div v-if="hasOwner" class="log-entry__identity">
            <CrewIdentityCard
              :call-sign="log?.owner?.callSign ?? null"
              :display-name="log?.owner?.displayName ?? null"
              :profile-slug="log?.owner?.profileSlug ?? null"
              :to="ownerProfileHref"
              :role-label="ownerRoleLabel"
              :avatar-url="log?.owner?.avatarUrl ?? null"
              size="sm"
              status="offline"
              :meta-label="ownerRoleLabel"
            />
          </div>
          <UiText v-if="missionLabel" variant="muted" class="log-entry__mission">
            {{ missionLabel }}
          </UiText>
        </header>

        <div class="log-entry__body">
          <!-- eslint-disable vue/no-v-html -- log bodies are sanitized on the CMS API -->
          <div v-if="htmlBody" class="log-entry__body-content log-entry__body-content--html" v-html="htmlBody" />
          <!-- eslint-enable vue/no-v-html -->
          <div v-else class="log-entry__body-content">
            <p v-for="(paragraph, index) in bodyParagraphs" :key="index">{{ paragraph }}</p>
          </div>
        </div>

        <nav class="log-entry__nav" aria-label="Log navigation">
          <UiLinkButton
            v-if="previousHref && previousTitle"
            :to="previousHref"
            variant="secondary"
            size="sm"
            :aria-label="previousAriaLabel"
          >
            Previous
          </UiLinkButton>
          <span v-else class="log-entry__nav-spacer" aria-hidden="true" />

          <UiLinkButton variant="secondary" size="sm" to="/bridge/logbook">
            All logs
          </UiLinkButton>

          <UiLinkButton
            v-if="nextHref && nextTitle"
            :to="nextHref"
            variant="secondary"
            size="sm"
            :aria-label="nextAriaLabel"
          >
            Next
          </UiLinkButton>
          <span v-else class="log-entry__nav-spacer" aria-hidden="true" />
        </nav>
      </UiStack>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { createError, useAsyncData, useHead, useRoute } from '#imports';

import { CREW_ROLE_LABELS } from '@astralpirates/shared/crewRoles';
import { resolveLogHref } from '@astralpirates/shared/logs';
import { getRequestFetch } from '~/modules/api';
import { normalizeAvatarUrl } from '~/modules/media/avatarUrls';
import { LogsResponseSchema, type LogSummary } from '@astralpirates/shared/api-contracts';
import CrewIdentityCard from '~/components/CrewIdentityCard.vue';
import { UiHeading, UiLinkButton, UiStack, UiSurface, UiText } from '~/components/ui';
import { fetchLogNeighbors, ensureMissionSummaries, type MissionSummary } from '~/utils/logs';
import { reportClientEvent } from '~/utils/errorReporter';

const route = useRoute();
const slugParam = computed(() => {
  const raw = route.params.slug;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return typeof raw === 'string' ? raw : '';
});

const normalizeLogOwnerAvatar = (entry: LogSummary): LogSummary => {
  if (!entry.owner) return entry;
  const normalizedAvatarUrl = normalizeAvatarUrl(entry.owner.avatarUrl);
  if (!normalizedAvatarUrl || normalizedAvatarUrl === entry.owner.avatarUrl) return entry;
  return {
    ...entry,
    owner: {
      ...entry.owner,
      avatarUrl: normalizedAvatarUrl,
    },
  };
};

if (!slugParam.value) {
  throw createError({ statusCode: 404, statusMessage: 'Log not found' });
}

const fetchLog = async () => {
  const slug = slugParam.value;
  if (!slug) {
    throw createError({ statusCode: 404, statusMessage: 'Log not found' });
  }

  const fetcher = getRequestFetch();
  const params = new URLSearchParams();
  params.set('limit', '1');
  params.set('slug', slug);

  const response = await fetcher(`/api/logs?${params.toString()}`);
  const parsed = LogsResponseSchema.parse(response);
  const entry = parsed.logs[0];
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Log not found' });
  }
  return normalizeLogOwnerAvatar(entry);
};

const { data, pending, error } = await useAsyncData(
  () => `log-entry-${slugParam.value}`,
  fetchLog,
  {
    watch: [slugParam],
  },
);

if (process.server) {
  if (error.value) {
    throw error.value;
  }
  if (!data.value) {
    throw createError({ statusCode: 404, statusMessage: 'Log not found' });
  }
}

const log = computed(() => data.value ?? null);
const hasOwner = computed(() => Boolean(log.value?.owner));
const errorMessage = computed(() => {
  if (!error.value) return null;
  const err = error.value as { statusMessage?: string; message?: string };
  return err?.statusMessage ?? err?.message ?? 'Failed to load log entry.';
});

const logStampCode = computed(() => log.value?.dateCode ?? log.value?.slug ?? slugParam.value);
const logStampText = computed(() => (logStampCode.value ? `LOG ${logStampCode.value}` : 'LOG ENTRY'));
const logHeadline = computed(() => log.value?.headline?.trim() || null);
const pageTitle = computed(() => (logHeadline.value ? `${logStampText.value} – ${logHeadline.value}` : logStampText.value));

const metaLine = computed(() => {
  const parts: string[] = [];
  if (log.value?.logDate) {
    const date = new Date(log.value.logDate);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toUTCString());
    }
  } else if (log.value?.dateCode) {
    parts.push(log.value.dateCode);
  }
  if (!hasOwner.value && log.value?.owner?.displayName) {
    parts.push(log.value.owner.displayName);
  }
  return parts.length ? parts.join(' - ') : null;
});

const rawBody = computed(() => log.value?.body?.trim() ?? '');

const htmlBody = computed(() => {
  const raw = rawBody.value;
  if (!raw) return null;
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }
  return null;
});

const bodyParagraphs = computed(() => {
  if (htmlBody.value) return [];
  if (!rawBody.value) return [];
  return rawBody.value
    .split(/\r?\n{2,}/)
    .map((paragraph) => paragraph.replace(/\r?\n/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
});

const ownerRoleLabel = computed(() => {
  const role = log.value?.owner?.role ?? null;
  if (!role) return 'Crew';
  return Object.prototype.hasOwnProperty.call(CREW_ROLE_LABELS, role)
    ? CREW_ROLE_LABELS[role as keyof typeof CREW_ROLE_LABELS]
    : 'Crew';
});

const ownerProfileHref = computed(() => {
  const slug = log.value?.owner?.profileSlug?.trim();
  if (!slug) return null;
  return `/gangway/crew-quarters/${slug}`;
});

const missionSummary = ref<MissionSummary | null>(null);

watch(
  () => log.value?.flightPlanId ?? null,
  (flightPlanId) => {
    if (typeof flightPlanId !== 'number') {
      missionSummary.value = null;
      return;
    }
    ensureMissionSummaries([flightPlanId])
      .then((map) => {
        missionSummary.value = map.get(flightPlanId) ?? null;
      })
      .catch((missionError) => {
        reportClientEvent({
          component: 'LogEntryPage',
          message: 'Failed to fetch mission summary',
          error: missionError,
          level: 'warn',
          meta: { flightPlanId },
        });
        missionSummary.value = null;
      });
  },
  { immediate: true },
);

const missionLabel = computed(() => {
  const mission = missionSummary.value;
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

  const tombstone = log.value?.flightPlanTombstone ?? null;
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

const { data: adjacentLogs } = await useAsyncData(
  () => `log-adjacent-${slugParam.value}`,
  async () => {
    const entry = log.value;
    if (!entry) return { previous: null, next: null };
    try {
      return await fetchLogNeighbors(entry);
    } catch (adjacentError) {
      reportClientEvent({
        component: 'LogEntryPage',
        message: 'Failed to resolve adjacent logs',
        error: adjacentError,
        level: 'warn',
        meta: { slug: entry.slug },
      });
      return { previous: null, next: null };
    }
  },
  {
    watch: [slugParam, () => log.value?.createdAt ?? null],
  },
);

const previousLog = computed<LogSummary | null>(() => adjacentLogs.value?.previous ?? null);
const nextLog = computed<LogSummary | null>(() => adjacentLogs.value?.next ?? null);

const previousHref = computed(() => (previousLog.value ? resolveLogHref(previousLog.value) : null));
const nextHref = computed(() => (nextLog.value ? resolveLogHref(nextLog.value) : null));

const previousTitle = computed(() =>
  previousLog.value?.displayLabel?.trim() || previousLog.value?.title?.trim() || previousLog.value?.slug || '',
);
const nextTitle = computed(() =>
  nextLog.value?.displayLabel?.trim() || nextLog.value?.title?.trim() || nextLog.value?.slug || '',
);

const previousAriaLabel = computed(() => {
  if (!previousTitle.value) return 'Previous log';
  return `Previous log: ${previousTitle.value}`;
});
const nextAriaLabel = computed(() => {
  if (!nextTitle.value) return 'Next log';
  return `Next log: ${nextTitle.value}`;
});

useHead(() => ({
  title: pageTitle.value ? `${pageTitle.value} - Astral Pirates` : "Captain's log - Astral Pirates",
  meta: [
    log.value?.excerpt
      ? { name: 'description', content: log.value.excerpt }
      : undefined,
  ].filter(Boolean) as { name: string; content: string }[],
}));
</script>

<style scoped>
.log-entry-page {
  display: grid;
  gap: var(--space-xl);
}

.log-entry-page__state {
  display: grid;
  justify-items: start;
  gap: var(--space-md);
}

.log-entry-page__state--error {
  color: #ff9a9a;
}

.log-entry {
  display: grid;
  gap: var(--space-lg);
}

.log-entry__header {
  display: grid;
  gap: var(--space-xs);
}

.log-entry__eyebrow {
  text-transform: uppercase;
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 2.5);
  font-size: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
  color: rgba(255, 255, 255, 0.75);
}

.log-entry__code {
  font-size: calc(var(--size-base-space-rem) * 0.8 * var(--size-scale-factor));
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.25);
  text-transform: uppercase;
  color: rgba(207, 237, 255, 0.7);
}

.log-entry__title {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: calc(var(--size-base-space-rem) * 0.4 * var(--size-scale-factor));
}

.log-entry__code {
  font-weight: 600;
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.5);
}

.log-entry__headline {
  font-style: italic;
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.625);
  text-transform: none;
}

.log-entry__separator {
  opacity: 0.7;
}

.log-entry__meta {
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
  font-size: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));
}

.log-entry__identity {
  margin-top: var(--space-sm);
}

.log-entry__mission {
  margin: 0;
  font-size: calc(var(--size-base-space-rem) * 0.8 * var(--size-scale-factor));
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
  color: rgba(173, 218, 255, 0.75);
}

.log-entry__body {
  line-height: 1.7;
}

.log-entry__body-content {
  display: grid;
  gap: var(--space-md);
}

.log-entry__body-content--html {
  gap: 0;
}

.log-entry__body-content--html :deep(p) {
  margin: 0 0 var(--space-md);
}

.log-entry__body-content--html :deep(p:last-child) {
  margin-bottom: 0;
}

.log-entry__nav {
  margin-top: var(--space-lg);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
  align-items: center;
}

.log-entry__nav :deep(.ui-link-button) {
  justify-self: start;
}

.log-entry__nav-spacer {
  display: block;
  min-height: var(--size-base-layout-px);
}

@media (--bp-max-compact) {
  .log-entry__nav {
    grid-template-columns: 1fr;
    margin-top: var(--space-md);
  }

  .log-entry__nav :deep(.ui-link-button) {
    justify-self: stretch;
    text-align: center;
  }

  .log-entry__nav-spacer {
    display: none;
  }
}
</style>
