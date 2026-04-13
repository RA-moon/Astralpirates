<template>
  <UiSurface v-if="shouldDisplay" :variant="surfaceVariant" class="gallery-section">
    <UiStack :gap="'var(--space-md)'">
      <div v-if="title || hasIntro || subtitle" class="gallery-section__header">
        <UiHeading v-if="title" :level="headingLevel" :size="headingSize" :uppercase="false">
          {{ title }}
        </UiHeading>
        <RichTextRenderer v-if="hasIntro" :content="intro ?? []" class="gallery-section__intro" />
        <UiText v-else-if="subtitle" variant="muted">{{ subtitle }}</UiText>
      </div>
      <UiImageCarousel v-if="hasSlides" :slides="carouselSlides" />
      <UiText v-else variant="muted" class="gallery-section__empty">
        {{ emptyMessage }}
      </UiText>
    </UiStack>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FlightPlanGallerySlide, RichTextContent } from '~/modules/api/schemas';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import { UiHeading, UiImageCarousel, UiStack, UiSurface, UiText } from '~/components/ui';
import { resolveGalleryUploadDisplayUrl } from '~/modules/media/galleryUrls';
import { deduceGalleryMediaType } from '~/modules/media/galleryMedia';

type GallerySlideInput = FlightPlanGallerySlide & {
  caption?: string | null;
};
type SanitizedGallerySlide = GallerySlideInput & {
  imageType: 'upload' | 'url';
  mediaType: 'image' | 'video' | 'audio' | 'model';
  resolvedImageUrl: string;
};

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    intro?: RichTextContent;
    slides?: GallerySlideInput[] | null;
    emptyMessage?: string;
    showWhenEmpty?: boolean;
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    headingSize?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    surfaceVariant?: 'panel' | 'card' | 'subtle';
  }>(),
  {
    title: '',
    subtitle: '',
    intro: () => [],
    slides: () => [],
    emptyMessage: 'No media available.',
    showWhenEmpty: false,
    headingLevel: 2,
    headingSize: 'h4',
    surfaceVariant: 'panel',
  },
);

const hasIntro = computed(() => Array.isArray(props.intro) && props.intro.length > 0);

const sanitizedSlides = computed<SanitizedGallerySlide[]>(() =>
  (props.slides ?? [])
    .map((slide) => {
      const imageType: 'upload' | 'url' = slide?.imageType === 'upload' ? 'upload' : 'url';
      const resolvedImageUrl = resolveGalleryUploadDisplayUrl({
        imageType,
        imageUrl: slide?.imageUrl,
        asset: slide?.asset as
          | { filename?: string | null; url?: string | null; mimeType?: string | null }
          | null
          | undefined,
      });
      const mediaType = deduceGalleryMediaType({
        mediaType: slide?.mediaType,
        mimeType: slide?.asset?.mimeType,
        filename: slide?.asset?.filename,
        url: resolvedImageUrl || slide?.imageUrl,
      });
      return {
        ...slide,
        imageType,
        mediaType,
        resolvedImageUrl,
      };
    })
    .filter(
      (slide): slide is SanitizedGallerySlide =>
        typeof slide.resolvedImageUrl === 'string' && slide.resolvedImageUrl.length > 0,
    ),
);

const carouselSlides = computed(() =>
  sanitizedSlides.value.map((slide, index) => {
    const label =
      (slide.title && slide.title.trim()) ||
      (slide.label && slide.label.trim()) ||
      `Slide ${index + 1}`;
    const caption =
      (slide.description && slide.description.trim()) ||
      (slide.caption && slide.caption.trim()) ||
      '';
    const imageAlt = (slide.imageAlt && slide.imageAlt.trim()) || label;
    return {
      label,
      caption,
      imageUrl: slide.resolvedImageUrl,
      imageAlt,
      mediaType: slide.mediaType,
      creditLabel: slide.creditLabel ?? '',
      creditUrl: slide.creditUrl ?? '',
    };
  }),
);

const hasSlides = computed(() => carouselSlides.value.length > 0);
const shouldDisplay = computed(() => hasSlides.value || props.showWhenEmpty);
</script>

<style scoped>
.gallery-section__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.gallery-section__intro :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.gallery-section__empty {
  font-style: italic;
}
</style>
