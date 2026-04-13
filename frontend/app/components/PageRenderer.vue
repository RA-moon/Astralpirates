<template>
<div v-if="visibleBlocks.length" class="page-renderer u-stack u-stack--page">
    <component
      v-for="(block, index) in visibleBlocks"
      :is="resolveComponent(block.blockType)"
      :key="`${block.blockType}-${index}`"
      :block="block"
    />
  </div>
  <p v-else class="page-renderer__empty">No content available for this page.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  canReadWithAccessPolicy,
  resolveEffectiveAccessPolicy,
  type AccessPolicyInput,
  type AccessPolicy,
} from '@astralpirates/shared/accessPolicy';
import { CREW_ROLE_SET, type CrewRole } from '@astralpirates/shared/crewRoles';

import PageCardGridBlock from '~/components/page-blocks/PageCardGridBlock.vue';
import PageCTAListBlock from '~/components/page-blocks/PageCTAListBlock.vue';
import PageCrewPreviewBlock from '~/components/page-blocks/PageCrewPreviewBlock.vue';
import PageCrewRosterBlock from '~/components/page-blocks/PageCrewRosterBlock.vue';
import PageHeroBlock from '~/components/page-blocks/PageHeroBlock.vue';
import PageImageCarouselBlock from '~/components/page-blocks/PageImageCarouselBlock.vue';
import PageNavigationModuleBlock from '~/components/page-blocks/PageNavigationModuleBlock.vue';
import PageStatGridBlock from '~/components/page-blocks/PageStatGridBlock.vue';
import PageTimelineBlock from '~/components/page-blocks/PageTimelineBlock.vue';
import type { PageBlock } from '~/modules/api/schemas';
import { useSessionStore } from '~/stores/session';

const props = withDefaults(defineProps<{
  blocks: PageBlock[];
  parentAccessPolicy?: AccessPolicy | null;
  ownerId?: string | number | null;
}>(), {
  parentAccessPolicy: null,
  ownerId: null,
});

const session = useSessionStore();
const currentCrewRole = computed<CrewRole | null>(() => {
  const role = session.currentUser?.role;
  if (typeof role !== 'string') return null;
  const normalized = role.trim().toLowerCase();
  if (!CREW_ROLE_SET.has(normalized as CrewRole)) return null;
  return normalized as CrewRole;
});

const visibleBlocks = computed(() =>
  props.blocks.filter((block) => {
    const policy = resolveEffectiveAccessPolicy({
      policy: (block as { accessPolicy?: unknown }).accessPolicy as AccessPolicyInput,
      parentPolicy: props.parentAccessPolicy,
      fallbackPolicy: { mode: 'public' },
      defaultRoleSpace: 'crew',
    });

    return canReadWithAccessPolicy(policy, {
      isAuthenticated: session.isAuthenticated,
      userId: session.currentUser?.id ?? null,
      ownerId: props.ownerId,
      crewRole: currentCrewRole.value,
    });
  }),
);

const componentMap: Record<PageBlock['blockType'], any> = {
  hero: PageHeroBlock,
  cardGrid: PageCardGridBlock,
  ctaList: PageCTAListBlock,
  timeline: PageTimelineBlock,
  imageCarousel: PageImageCarouselBlock,
  statGrid: PageStatGridBlock,
  crewPreview: PageCrewPreviewBlock,
  crewRoster: PageCrewRosterBlock,
  navigationModule: PageNavigationModuleBlock,
};

const resolveComponent = (type: PageBlock['blockType']) => {
  return componentMap[type] ?? 'div';
};
</script>

<style scoped>
.page-renderer__empty {
  color: var(--color-text-meta);
  text-align: center;
  padding: var(--layout-section-gap) 0;
}
</style>
