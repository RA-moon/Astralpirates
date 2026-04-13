<template>
  <article class="gallery-slide-editor">
    <UiAccordion
      :items="[{ id: accordionId, title }]"
      class="gallery-slide-editor__accordion"
    >
      <template #title>
        <UiInline class="gallery-slide-editor__title-row" :gap="'var(--space-xs)'" align="center">
          <UiText>{{ title }}</UiText>
        </UiInline>
      </template>
      <template #item>
        <div class="gallery-slide-editor__preview">
          <img
            v-if="showImage"
            :src="resolvedPreviewUrl"
            :alt="previewAlt"
            @error="$emit('preview-error')"
          />
          <video
            v-else-if="showVideo"
            :src="resolvedPreviewUrl"
            controls
            preload="metadata"
            :aria-label="previewAlt"
            @error="$emit('preview-error')"
          />
          <audio
            v-else-if="showAudio"
            :src="resolvedPreviewUrl"
            controls
            preload="metadata"
            :aria-label="previewAlt"
            @error="$emit('preview-error')"
          />
          <div
            v-else-if="showModel"
            class="gallery-slide-editor__model-preview"
          >
            <UiText variant="muted">{{ modelPreviewMessage }}</UiText>
            <a :href="resolvedPreviewUrl" target="_blank" rel="noopener noreferrer">
              Open model
            </a>
          </div>
          <div v-else-if="previewBroken" class="gallery-slide-editor__placeholder">
            {{ brokenPreviewMessage }}
          </div>
          <div v-else class="gallery-slide-editor__placeholder">{{ emptyPreviewMessage }}</div>
        </div>

        <div class="gallery-slide-editor__fields">
          <slot name="fields" />
        </div>

        <UiInline class="gallery-slide-editor__actions" :gap="'var(--space-xs)'">
          <UiButton
            type="button"
            size="sm"
            variant="ghost"
            :disabled="moveUpDisabled"
            :data-testid="moveUpTestId"
            @click="$emit('move-up')"
          >
            Move up
          </UiButton>
          <UiButton
            type="button"
            size="sm"
            variant="ghost"
            :disabled="moveDownDisabled"
            :data-testid="moveDownTestId"
            @click="$emit('move-down')"
          >
            Move down
          </UiButton>
          <UiButton
            type="button"
            size="sm"
            variant="destructive"
            :disabled="removeDisabled"
            :data-testid="removeTestId"
            @click="$emit('remove')"
          >
            Remove
          </UiButton>
          <slot name="actions" />
        </UiInline>
      </template>
    </UiAccordion>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  UiAccordion,
  UiButton,
  UiInline,
  UiText,
} from '~/components/ui';
import type { GalleryMediaType } from '~/modules/media/galleryMedia';

const props = withDefaults(
  defineProps<{
    accordionId: string;
    title: string;
    previewUrl: string | null;
    previewAlt: string;
    mediaType?: GalleryMediaType | null;
    previewBroken?: boolean;
    moveUpDisabled?: boolean;
    moveDownDisabled?: boolean;
    removeDisabled?: boolean;
    moveUpTestId?: string;
    moveDownTestId?: string;
    removeTestId?: string;
    modelPreviewMessage?: string;
    brokenPreviewMessage?: string;
    emptyPreviewMessage?: string;
  }>(),
  {
    mediaType: 'image',
    previewBroken: false,
    moveUpDisabled: false,
    moveDownDisabled: false,
    removeDisabled: false,
    moveUpTestId: 'gallery-move-up',
    moveDownTestId: 'gallery-move-down',
    removeTestId: 'gallery-remove-slide',
    modelPreviewMessage: '3D model preview is not embedded.',
    brokenPreviewMessage: 'Preview unavailable (file missing).',
    emptyPreviewMessage: 'No preview',
  },
);

defineEmits<{
  'preview-error': [];
  'move-up': [];
  'move-down': [];
  'remove': [];
}>();

const hasPreview = computed(() => Boolean(props.previewUrl));
const resolvedPreviewUrl = computed(() => props.previewUrl ?? undefined);
const showImage = computed(
  () =>
    hasPreview.value &&
    !props.previewBroken &&
    props.mediaType !== 'video' &&
    props.mediaType !== 'audio' &&
    props.mediaType !== 'model',
);
const showVideo = computed(
  () => hasPreview.value && !props.previewBroken && props.mediaType === 'video',
);
const showAudio = computed(
  () => hasPreview.value && !props.previewBroken && props.mediaType === 'audio',
);
const showModel = computed(
  () => hasPreview.value && !props.previewBroken && props.mediaType === 'model',
);
</script>

<style scoped>
.gallery-slide-editor {
  display: block;
}

.gallery-slide-editor__accordion {
  width: 100%;
}

.gallery-slide-editor__title-row {
  font-weight: var(--font-weight-semibold);
}

.gallery-slide-editor__preview {
  width: 100%;
  min-height: calc(var(--size-base-layout-px) * 180 * var(--size-scale-factor));
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  background: var(--color-surface-panel);
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery-slide-editor__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery-slide-editor__preview video {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
}

.gallery-slide-editor__preview audio {
  width: 100%;
  display: block;
  padding: var(--space-sm);
}

.gallery-slide-editor__model-preview {
  width: 100%;
  height: 100%;
  padding: var(--layout-card-padding);
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  align-items: center;
  justify-content: center;
  text-align: center;
}

.gallery-slide-editor__model-preview a {
  color: inherit;
  text-decoration: underline;
}

.gallery-slide-editor__placeholder {
  padding: var(--layout-card-padding);
  color: var(--color-text-meta);
}

.gallery-slide-editor__fields {
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
}

.gallery-slide-editor__actions {
  flex-wrap: wrap;
}
</style>
