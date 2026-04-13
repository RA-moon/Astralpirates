<template>
  <div
    class="crew-portrait"
    :class="sizeClass"
    :data-online="isOnline ? 'online' : 'offline'"
    :aria-hidden="decorative ? 'true' : 'false'"
  >
    <div class="crew-portrait__media">
      <AvatarMediaRenderer
        class="crew-portrait__renderer"
        :avatar-url="props.avatarUrl"
        :avatar-media-type="props.avatarMediaType"
        :avatar-media-url="props.avatarMediaUrl"
        :avatar-mime-type="props.avatarMimeType"
        :avatar-filename="props.avatarFilename"
        :alt="imageAlt"
        :decorative="props.decorative"
      />
    </div>
    <div v-if="showOverlay" class="crew-portrait__overlay">
      <span class="crew-portrait__callsign">{{ callSignText }}</span>
      <span class="crew-portrait__role">{{ roleText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AvatarMediaType } from '~/modules/media/avatarMedia';
import AvatarMediaRenderer from '~/components/AvatarMediaRenderer.vue';

const props = withDefaults(
  defineProps<{
    callSign?: string | null;
    displayName?: string | null;
    roleLabel?: string | null;
    avatarUrl?: string | null;
    avatarMediaType?: AvatarMediaType | null;
    avatarMediaUrl?: string | null;
    avatarMimeType?: string | null;
    avatarFilename?: string | null;
    status?: 'online' | 'offline' | string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    decorative?: boolean;
    showOverlay?: boolean;
  }>(),
  {
    callSign: null,
    displayName: null,
    roleLabel: null,
    avatarUrl: null,
    avatarMediaType: null,
    avatarMediaUrl: null,
    avatarMimeType: null,
    avatarFilename: null,
    status: 'offline',
    size: 'lg',
    decorative: false,
    showOverlay: true,
  },
);

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'crew-portrait--sm';
    case 'md':
      return 'crew-portrait--md';
    case 'xl':
      return 'crew-portrait--xl';
    default:
      return 'crew-portrait--lg';
  }
});

const normaliseText = (value: string | null | undefined, fallback: string) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  return fallback;
};

const callSignText = computed(() =>
  normaliseText(props.callSign, normaliseText(props.displayName, 'Astralpirate')),
);
const roleText = computed(() => normaliseText(props.roleLabel, 'Crew'));

const isOnline = computed(() => props.status === 'online');

const imageAlt = computed(() => {
  if (props.decorative) return '';
  return `${callSignText.value} portrait`;
});
</script>

<style scoped>
.crew-portrait {
  --crew-portrait-size-role: var(--size-avatar-xl);
  --crew-portrait-border-width: calc(var(--size-base-layout-px) * 4 * var(--size-scale-factor));
  --crew-portrait-callsign-font-size: calc(
    var(--crew-portrait-size, var(--crew-portrait-size-role)) * 0.1171
  );
  --crew-portrait-callsign-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.25);
  --crew-portrait-role-font-size: calc(
    var(--crew-portrait-size, var(--crew-portrait-size-role)) * 0.1029
  );
  --crew-portrait-role-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.75);
  position: relative;
  display: inline-flex;
  align-items: stretch;
  justify-content: center;
  width: var(--crew-portrait-size, var(--crew-portrait-size-role));
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: var(--gradient-portrait-background);
  border: var(--crew-portrait-border-width) solid var(--crew-portrait-border, var(--color-border-contrast));
  box-shadow: 0 0 0 transparent;
  transition:
    border-color var(--transition-duration-base) var(--transition-ease-standard),
    box-shadow var(--transition-duration-base) var(--transition-ease-standard),
    transform var(--transition-duration-base) var(--transition-ease-standard);
}

.crew-portrait--sm {
  --crew-portrait-size-role: var(--size-avatar-md);
}

.crew-portrait--md {
  --crew-portrait-size-role: var(--size-avatar-lg);
}

.crew-portrait--lg {
  --crew-portrait-size-role: var(--size-avatar-xl);
}

.crew-portrait--xl {
  --crew-portrait-size-role: var(--size-avatar-2xl);
}

.crew-portrait[data-online='online'] {
  --crew-portrait-border: var(--color-success);
  box-shadow: var(--shadow-glow-success);
}

.crew-portrait[data-online='offline'] {
  --crew-portrait-border: var(--color-danger);
  box-shadow: var(--shadow-glow-danger);
}

.crew-portrait__media {
  position: absolute;
  inset: 0;
}

.crew-portrait__renderer,
.crew-portrait__renderer :deep(.avatar-media),
.crew-portrait__renderer :deep(.avatar-media__image),
.crew-portrait__renderer :deep(.avatar-media__video),
.crew-portrait__renderer :deep(.avatar-media__model) {
  width: 100%;
  height: 100%;
  display: block;
}

.crew-portrait__renderer :deep(.avatar-media__image),
.crew-portrait__renderer :deep(.avatar-media__video),
.crew-portrait__renderer :deep(.avatar-media__model) {
  object-fit: cover;
}

.crew-portrait__overlay {
  position: absolute;
  inset: 0;
  padding:
    calc(var(--space-sm) * 0.8)
    var(--space-sm)
    calc(var(--space-sm) + var(--space-3xs));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--space-2xs) * 0.6);
  text-align: center;
  pointer-events: none;
  background: var(--gradient-portrait-overlay);
  opacity: 0;
  transition: opacity var(--transition-duration-base) var(--transition-ease-standard);
}

.crew-portrait:hover .crew-portrait__overlay,
.crew-portrait:focus-visible .crew-portrait__overlay {
  opacity: 1;
}

.crew-portrait__callsign {
  font-size: var(--crew-portrait-callsign-font-size);
  letter-spacing: var(--crew-portrait-callsign-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-primary);
  text-shadow: var(--shadow-text-contrast);
}

.crew-portrait__role {
  font-size: var(--crew-portrait-role-font-size);
  letter-spacing: var(--crew-portrait-role-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
</style>
