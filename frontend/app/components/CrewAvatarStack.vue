<template>
  <ul class="crew-avatar-stack" :data-size="sizeVariant" role="list">
    <li
      v-for="member in displayCrew"
      :key="member.id"
      class="crew-avatar-stack__item"
    >
      <NuxtLink
        v-if="member.profileSlug"
        class="crew-avatar-stack__avatar"
        :to="profileHref(member.profileSlug)"
        :title="tooltipFor(member)"
      >
        <AvatarMediaRenderer
          class="crew-avatar-stack__renderer"
          :avatar-url="member.avatarUrl ?? null"
          :avatar-media-type="member.avatarMediaType ?? null"
          :avatar-media-url="member.avatarMediaUrl ?? null"
          :avatar-mime-type="member.avatarMimeType ?? null"
          :avatar-filename="member.avatarFilename ?? null"
          :alt="tooltipFor(member)"
          :compact="true"
        />
      </NuxtLink>
      <span
        v-else
        class="crew-avatar-stack__avatar"
        :title="tooltipFor(member)"
        aria-hidden="true"
      >
        <AvatarMediaRenderer
          class="crew-avatar-stack__renderer"
          :avatar-url="member.avatarUrl ?? null"
          :avatar-media-type="member.avatarMediaType ?? null"
          :avatar-media-url="member.avatarMediaUrl ?? null"
          :avatar-mime-type="member.avatarMimeType ?? null"
          :avatar-filename="member.avatarFilename ?? null"
          :alt="tooltipFor(member)"
          :compact="true"
        />
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CREW_ROLE_LABELS } from '@astralpirates/shared/crewRoles';
import type { CrewSummary } from '~/modules/api/schemas';
import AvatarMediaRenderer from '~/components/AvatarMediaRenderer.vue';

const props = withDefaults(
  defineProps<{
    crew?: CrewSummary[];
    max?: number;
    size?: 'sm' | 'md';
  }>(),
  {
    crew: () => [],
    max: 5,
    size: 'md',
  },
);

const sizeVariant = computed(() => (props.size === 'sm' ? 'sm' : 'md'));
const displayCrew = computed(() => props.crew.slice(0, props.max));

const resolveRoleLabel = (role?: string | null) => {
  if (!role) return 'Crew';
  return Object.prototype.hasOwnProperty.call(CREW_ROLE_LABELS, role)
    ? CREW_ROLE_LABELS[role as keyof typeof CREW_ROLE_LABELS]
    : 'Crew';
};

const tooltipFor = (member: CrewSummary) => {
  const parts = [member.displayName || member.callSign || 'Crew'];
  parts.push(resolveRoleLabel(member.role));
  return parts.join(' · ');
};

const profileHref = (slug: string) => `/gangway/crew-quarters/${slug}`;
</script>

<style scoped>
.crew-avatar-stack {
  --avatar-size: var(--size-avatar-sm);
  --avatar-gap: calc(var(--avatar-size) * 0.1333);
  --avatar-border-width: calc(var(--size-base-layout-px) * 2 * var(--size-scale-factor));
  display: flex;
  align-items: center;
  gap: var(--avatar-gap);
  padding: 0;
  margin: 0;
  list-style: none;
}

.crew-avatar-stack[data-size='sm'] {
  --avatar-size: var(--size-avatar-xs);
}

.crew-avatar-stack__item {
  width: var(--avatar-size);
  height: var(--avatar-size);
  flex: 0 0 var(--avatar-size);
}

.crew-avatar-stack__avatar {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-pill);
  border: var(--avatar-border-width) solid var(--color-border-contrast);
  background: var(--color-surface-avatar);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-primary);
  font-weight: 600;
  text-transform: uppercase;
  text-decoration: none;
  overflow: hidden;
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.crew-avatar-stack__renderer,
.crew-avatar-stack__renderer :deep(.avatar-media),
.crew-avatar-stack__renderer :deep(.avatar-media__image),
.crew-avatar-stack__renderer :deep(.avatar-media__video),
.crew-avatar-stack__renderer :deep(.avatar-media__model),
.crew-avatar-stack__renderer :deep(.avatar-media__model-link--compact) {
  width: 100%;
  height: 100%;
  display: block;
}

.crew-avatar-stack__renderer :deep(.avatar-media__image),
.crew-avatar-stack__renderer :deep(.avatar-media__video),
.crew-avatar-stack__renderer :deep(.avatar-media__model) {
  object-fit: cover;
}

.crew-avatar-stack__avatar:hover,
.crew-avatar-stack__avatar:focus-visible {
  transform: translateY(calc(var(--size-base-layout-px) * -1 * var(--size-scale-factor)));
  border-color: var(--color-border-focus);
}
</style>
