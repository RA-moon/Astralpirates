<template>
  <component
    :is="componentTag"
    v-bind="componentBindings"
    :class="[
      'crew-identity',
      `crew-identity--${sizeVariant}`,
      { 'crew-identity--interactive': isInteractive },
    ]"
    :data-status="statusValue"
  >
    <CrewPortrait
      :call-sign="props.callSign"
      :display-name="props.displayName"
      :role-label="props.roleLabel"
      :avatar-url="props.avatarUrl"
      :avatar-media-type="props.avatarMediaType"
      :avatar-media-url="props.avatarMediaUrl"
      :avatar-mime-type="props.avatarMimeType"
      :avatar-filename="props.avatarFilename"
      :status="statusValue"
      :size="sizeVariant"
      :show-overlay="props.showOverlay"
      :decorative="props.decorative"
    />
    <div v-if="showMeta" class="crew-identity__meta" :data-status="statusValue">
      <slot name="meta" :status="statusValue">
        {{ metaLabelText }}
      </slot>
    </div>
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, mergeProps, resolveComponent, useAttrs, useSlots } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import type { AvatarMediaType } from '~/modules/media/avatarMedia';

import CrewPortrait from '~/components/CrewPortrait.vue';

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
    profileSlug?: string | null;
    status?: 'online' | 'offline' | string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showOverlay?: boolean;
    decorative?: boolean;
    to?: RouteLocationRaw | null;
    href?: string | null;
    rel?: string | null;
    target?: string | null;
    as?: string | null;
    metaLabel?: string | null;
    title?: string | null;
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
    profileSlug: null,
    status: 'offline',
    size: 'lg',
    showOverlay: true,
    decorative: false,
    to: null,
    href: null,
    rel: null,
    target: null,
    as: null,
    metaLabel: null,
    title: null,
  },
);

const normaliseText = (value: string | null | undefined) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
};

const formatProfileHref = (value: string | null | undefined) => {
  const slug = normaliseText(value).replace(/^\/+/, '');
  if (!slug) return null;
  if (slug.startsWith('gangway/crew-quarters')) {
    return `/${slug}`;
  }
  return `/gangway/crew-quarters/${slug}`;
};

const attrs = useAttrs();
const slots = useSlots();

const profileHref = computed(() => formatProfileHref(props.profileSlug));

const resolvedTo = computed<RouteLocationRaw | null>(() => props.to ?? profileHref.value ?? null);

const resolvedHref = computed(() => {
  if (resolvedTo.value) return null;
  return props.href ?? null;
});

const componentTag = computed(() => {
  if (resolvedTo.value) {
    const resolved = resolveComponent('NuxtLink', false);
    return resolved ?? 'NuxtLink';
  }
  if (resolvedHref.value) return 'a';
  return props.as ?? 'div';
});

const componentSpecificAttrs = computed(() => {
  const next: Record<string, unknown> = {};
  if (resolvedTo.value) {
    next.to = resolvedTo.value;
  } else if (resolvedHref.value) {
    next.href = resolvedHref.value;
    if (props.target) next.target = props.target;
    if (props.rel || props.target === '_blank') {
      next.rel = props.rel ?? 'noopener';
    }
  }
  if (props.title) next.title = props.title;
  return next;
});

const componentBindings = computed(() => mergeProps(attrs, componentSpecificAttrs.value));

const sizeVariant = computed(() => {
  switch (props.size) {
    case 'sm':
    case 'md':
    case 'xl':
      return props.size;
    default:
      return 'lg';
  }
});

const statusValue = computed(() => {
  if (!props.status) return 'unknown';
  const lowered = props.status.toLowerCase();
  if (lowered === 'online' || lowered === 'offline') return lowered;
  return lowered || 'unknown';
});

const isInteractive = computed(() => Boolean(resolvedTo.value || resolvedHref.value));

const metaLabelText = computed(() => normaliseText(props.metaLabel));

const showMeta = computed(() => Boolean(slots.meta) || Boolean(metaLabelText.value));
</script>

<style scoped>
.crew-identity {
  --crew-identity-gap-role: var(--crew-identity-gap);
  --crew-identity-meta-font-size-role: var(--crew-identity-meta-font-size);
  --crew-identity-meta-letter-spacing-role: var(--crew-identity-meta-letter-spacing);
  --crew-identity-min-width-role: max-content;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: var(--crew-identity-gap-size, var(--crew-identity-gap-role));
  text-align: center;
  min-width: var(--crew-identity-min-width-size, var(--crew-identity-min-width-role));
  scroll-snap-align: var(--crew-identity-scroll-snap, initial);
  color: inherit;
}

.crew-identity--interactive {
  text-decoration: none;
}

.crew-identity--interactive:focus-visible {
  outline: calc(var(--size-base-layout-px) * 2 * var(--size-scale-factor)) solid var(--color-border-focus);
  outline-offset: calc(var(--size-base-layout-px) * 4 * var(--size-scale-factor));
}

.crew-identity__meta {
  font-size: var(--crew-identity-meta-font-size-size, var(--crew-identity-meta-font-size-role));
  letter-spacing: var(
    --crew-identity-meta-letter-spacing-size,
    var(--crew-identity-meta-letter-spacing-role)
  );
  text-transform: uppercase;
  line-height: 1.2;
  color: var(--crew-identity-meta-color, var(--color-text-meta));
  transition: color var(--transition-duration-base) var(--transition-ease-standard);
}

.crew-identity__meta[data-status='online'] {
  color: var(--crew-identity-meta-color-online, var(--color-success));
}

.crew-identity--sm {
  --crew-identity-gap-role: calc(var(--space-xs) * 0.6);
  --crew-identity-meta-font-size-role: calc(var(--crew-identity-meta-font-size) * 0.8571);
  --crew-identity-meta-letter-spacing-role: calc(var(--crew-identity-meta-letter-spacing) * 1.25);
  --crew-identity-min-width-role: var(--size-avatar-md);
}

.crew-identity--md {
  --crew-identity-gap-role: var(--crew-identity-gap);
  --crew-identity-meta-font-size-role: var(--crew-identity-meta-font-size);
  --crew-identity-meta-letter-spacing-role: var(--crew-identity-meta-letter-spacing);
  --crew-identity-min-width-role: var(--size-avatar-lg);
}

.crew-identity--lg {
  --crew-identity-gap-role: calc(var(--space-xs) * 0.8);
  --crew-identity-meta-font-size-role: calc(var(--crew-identity-meta-font-size) * 1.0286);
  --crew-identity-meta-letter-spacing-role: var(--crew-identity-meta-letter-spacing);
  --crew-identity-min-width-role: var(--size-avatar-xl);
}

.crew-identity--xl {
  --crew-identity-gap-role: var(--space-xs);
  --crew-identity-meta-font-size-role: calc(var(--crew-identity-meta-font-size) * 1.1714);
  --crew-identity-meta-letter-spacing-role: calc(var(--crew-identity-meta-letter-spacing) * 0.75);
  --crew-identity-min-width-role: var(--size-avatar-2xl);
}
</style>
