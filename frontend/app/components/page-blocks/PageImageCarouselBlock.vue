<template>
  <GallerySection
    :title="block.title ?? ''"
    :intro="block.intro ?? []"
    :slides="normalizedSlides"
    :show-when-empty="true"
    empty-message="No media available."
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { ImageCarouselBlock } from '~/modules/api/schemas';
import GallerySection from '~/components/gallery/GallerySection.vue';
import { resolveGalleryUploadDisplayUrl } from '~/modules/media/galleryUrls';
import { deduceGalleryMediaType } from '~/modules/media/galleryMedia';

const props = defineProps<{
  block: ImageCarouselBlock;
}>();

const pickUploadRelation = (
  value: ImageCarouselBlock['slides'][number]['galleryImage'],
): { filename?: string | null; url?: string | null; mimeType?: string | null } | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    filename: typeof record.filename === 'string' ? record.filename : null,
    url: typeof record.url === 'string' ? record.url : null,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
  };
};

const normalizedSlides = computed(() =>
  (props.block.slides ?? []).map((slide, index) => {
    const imageType: 'upload' | 'url' = slide.imageType === 'upload' ? 'upload' : 'url';
    const uploadRelation = pickUploadRelation(slide.galleryImage);
    const imageUrl =
      resolveGalleryUploadDisplayUrl({
        imageType,
        imageUrl: slide.imageUrl ?? uploadRelation?.url ?? '',
        asset: uploadRelation,
      }) ?? '';
    const mediaType = deduceGalleryMediaType({
      mediaType: slide.mediaType,
      mimeType: uploadRelation?.mimeType,
      filename: uploadRelation?.filename,
      url: imageUrl,
    });

    return {
      label: slide.label ?? '',
      title: slide.title || slide.label || `Slide ${index + 1}`,
      description: slide.caption ?? null,
      mediaType,
      imageType,
      imageUrl,
      imageAlt: slide.imageAlt || slide.label || `Slide ${index + 1}`,
      creditLabel: slide.creditLabel ?? null,
      creditUrl: slide.creditUrl ?? null,
      asset: null,
    };
  }),
);
</script>
