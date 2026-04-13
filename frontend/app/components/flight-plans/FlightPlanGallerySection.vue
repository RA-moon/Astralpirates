<template>
  <GallerySection
    title="Mission gallery"
    subtitle="Reference media shared with the crew."
    :slides="props.slides ?? []"
    :show-when-empty="props.canEdit"
    empty-message="Add up to eight reference media items from the mission editor to guide the crew."
  />
</template>

<script setup lang="ts">
import type { FlightPlanGallerySlide } from '~/modules/api/schemas';
import GallerySection from '~/components/gallery/GallerySection.vue';

const props = withDefaults(
  defineProps<{
    slides?: FlightPlanGallerySlide[] | null;
    canEdit?: boolean;
  }>(),
  {
    slides: () => [],
    canEdit: false,
  },
);
</script>
