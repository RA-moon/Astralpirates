<template>
  <ul
    v-if="badgesToRender.length"
    class="honor-badge-list"
    :data-display-mode="displayMode"
    role="list"
  >
    <li v-for="badge in badgesToRender" :key="badge.code" class="honor-badge-list__item">
      <span class="honor-badge" :title="badge.tooltip ?? badge.label ?? badge.code">
        <img
          v-if="badge.iconMediaType === 'image' && badge.iconDisplayUrl && !isBadgeMediaErrored(badge.code)"
          class="honor-badge__icon"
          :src="badge.iconDisplayUrl"
          :alt="badge.label ?? badge.code"
          loading="lazy"
          decoding="async"
          @error="markBadgeMediaErrored(badge.code)"
        />
        <video
          v-else-if="
            badge.iconMediaType === 'video' &&
            badge.iconDisplayUrl &&
            !isBadgeMediaErrored(badge.code)
          "
          class="honor-badge__icon honor-badge__icon--video"
          :aria-label="badge.label ?? badge.code"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          @error="markBadgeMediaErrored(badge.code)"
        >
          <source :src="badge.iconDisplayUrl" />
        </video>
        <a
          v-else-if="badge.iconMediaType === 'model' && badge.iconDisplayUrl"
          class="honor-badge__model-link"
          :href="badge.iconDisplayUrl"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Open 3D honor badge: ${badge.label ?? badge.code}`"
          title="Open 3D honor badge"
        >
          3D
        </a>
        <span v-else class="honor-badge__fallback" aria-hidden="true">{{ fallbackText(badge) }}</span>
        <span class="visually-hidden">{{ (badge.label ?? badge.code) + ' honor badge' }}</span>
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HonorBadge } from '~/modules/api/schemas';
import {
  normalizeHonorBadgeMediaRecord,
  type HonorBadgeMediaType,
} from '~/modules/media/honorBadgeMedia';

export type HonorBadgeDisplayMode = 'inline' | 'anchored' | 'compact';
type RenderableHonorBadge = HonorBadge & {
  iconMediaType: HonorBadgeMediaType;
  iconDisplayUrl: string | null;
};

const props = withDefaults(
  defineProps<{
    badges?: HonorBadge[] | null;
    displayMode?: HonorBadgeDisplayMode;
  }>(),
  {
    badges: () => [],
    displayMode: 'inline',
  },
);

const displayMode = computed<HonorBadgeDisplayMode>(() => props.displayMode);

const erroredBadgeCodes = ref<Set<string>>(new Set());

const markBadgeMediaErrored = (code: string) => {
  if (erroredBadgeCodes.value.has(code)) return;
  const next = new Set(erroredBadgeCodes.value);
  next.add(code);
  erroredBadgeCodes.value = next;
};

const isBadgeMediaErrored = (code: string): boolean => erroredBadgeCodes.value.has(code);

const badgesToRender = computed<RenderableHonorBadge[]>(() =>
  (props.badges ?? [])
    .filter((entry): entry is HonorBadge => Boolean(entry && entry.code))
    .map((entry) => {
      const media = normalizeHonorBadgeMediaRecord({
        iconUrl: entry.iconUrl,
        iconMediaUrl: entry.iconMediaUrl ?? null,
        iconMimeType: entry.iconMimeType ?? null,
        iconFilename: entry.iconFilename ?? null,
      });

      return {
        ...entry,
        tooltip: entry.tooltip ?? entry.label ?? entry.code,
        iconMediaType: media.iconMediaType,
        iconDisplayUrl: media.iconMediaUrl ?? media.iconUrl,
      };
    }),
);

const fallbackText = (badge: HonorBadge): string => {
  const labelSource = badge.label ?? badge.code;
  return labelSource.trim().slice(0, 1).toUpperCase();
};
</script>

<style scoped>
.honor-badge-list {
  --honor-badge-size-inline: var(--size-badge-md);
  --honor-badge-size-anchored: var(--size-badge-sm);
  --honor-badge-size-compact: var(--size-badge-xs);
  --honor-badge-size: var(--honor-badge-size-inline);
  --honor-badge-gap: calc(var(--honor-badge-size) * 0.2353);
  --honor-badge-anchor-overlap: calc(
    var(--honor-badge-size) * var(--size-ratio-badge-anchor-offset-to-avatar)
  );
  --honor-badge-border-color: var(--color-border-panel-strong);
  --honor-badge-background: var(--gradient-badge-dark);
  --honor-badge-fallback-background: var(--gradient-badge-fallback);
  display: flex;
  flex-wrap: wrap;
  gap: var(--honor-badge-gap);
  list-style: none;
  padding: 0;
  margin: 0;
}

.honor-badge-list[data-display-mode='compact'] {
  --honor-badge-size: var(--honor-badge-size-compact);
}

.honor-badge-list[data-display-mode='anchored'] {
  --honor-badge-size: var(--honor-badge-size-anchored);
  flex-wrap: nowrap;
  gap: 0;
}

.honor-badge-list[data-display-mode='anchored'] .honor-badge-list__item {
  margin-inline-start: calc(var(--honor-badge-anchor-overlap) * -1);
}

.honor-badge-list[data-display-mode='anchored'] .honor-badge-list__item:first-child {
  margin-inline-start: 0;
}

.honor-badge-list__item {
  margin: 0;
}

.honor-badge {
  position: relative;
  width: var(--honor-badge-size);
  height: var(--honor-badge-size);
  border-radius: var(--radius-pill);
  border: calc(var(--size-base-layout-px) * 1 * var(--size-scale-factor)) solid var(--honor-badge-border-color);
  background: var(--honor-badge-background);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition:
    transform var(--transition-duration-base) var(--transition-ease-standard),
    box-shadow var(--transition-duration-base) var(--transition-ease-standard),
    border-color var(--transition-duration-base) var(--transition-ease-standard);
}

.honor-badge:hover,
.honor-badge:focus-within {
  transform: translateY(calc(var(--size-base-layout-px) * -1 * var(--size-scale-factor)));
  box-shadow: var(--shadow-overlay);
  border-color: var(--color-border-strong);
}

.honor-badge__icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.honor-badge__icon--video {
  background: var(--color-surface-avatar);
}

.honor-badge__model-link {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  color: var(--color-text-primary);
  text-decoration: none;
  text-transform: uppercase;
  background: var(--honor-badge-fallback-background);
}

.honor-badge__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-weight: 700;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  color: var(--color-text-primary);
  background: var(--honor-badge-fallback-background);
}
</style>
