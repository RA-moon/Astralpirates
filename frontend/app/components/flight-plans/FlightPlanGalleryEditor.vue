<template>
<section class="flight-plan-gallery-editor u-section">
  <div class="flight-plan-gallery-editor__header">
    <div>
      <UiHeading :level="3" size="h5" :uppercase="false">Mission gallery</UiHeading>
      <UiText variant="muted">
        Upload media using the uploader below, then edit title + alt text. Slides stay collapsed by default to keep the editor compact.
      </UiText>
    </div>
    <UiText
      v-if="disabled && readonlyHelp"
      variant="muted"
      class="flight-plan-gallery-editor__readonly"
    >
      {{ readonlyHelp }}
    </UiText>
    <UiInline
      v-else-if="!disabled"
      class="flight-plan-gallery-editor__save"
      :gap="'var(--space-sm)'"
      align="center"
    >
      <UiText variant="muted">{{ gallerySaveStatus }}</UiText>
      <UiButton
        type="button"
        size="sm"
        variant="secondary"
        data-testid="gallery-save-button"
        :loading="gallerySaveState === 'saving'"
        :disabled="!canSaveGallery || gallerySaveState === 'saving' || !galleryHasUnsavedChanges"
        @click="saveGallery"
      >
        Save gallery
      </UiButton>
    </UiInline>
  </div>

  <UiText
    v-if="!disabled && gallerySaveError"
    class="flight-plan-gallery-editor__error"
    role="alert"
  >
    {{ gallerySaveError }}
  </UiText>
  <UiText
    v-if="!disabled && galleryLockNotice"
    :class="[
      'flight-plan-gallery-editor__lock-notice',
      { 'flight-plan-gallery-editor__lock-notice--error': galleryLockNoticeIsError },
    ]"
    role="status"
  >
    {{ galleryLockNotice }}
  </UiText>
  <UiInline
    v-if="!disabled && galleryLockTakeoverVisible"
    class="flight-plan-gallery-editor__takeover"
    :gap="'var(--space-sm)'"
    align="center"
  >
    <UiButton
      type="button"
      size="sm"
      variant="secondary"
      :loading="editorLock.takeoverPending.value"
      :disabled="editorLock.takeoverPending.value || gallerySaveState === 'saving'"
      @click="requestGalleryLockTakeover"
    >
      Take over lock
    </UiButton>
  </UiInline>

    <FlightPlanGalleryUploader
      v-if="!disabled"
      :can-upload="uploaderEnabled"
      :auth-token="bearer"
      :flight-plan-id="flightPlanId"
      :remaining-slots="remainingSlots"
      @uploaded="handleUploadedSlides"
    />

    <div v-if="slides.length" class="flight-plan-gallery-editor__list">
      <GallerySlideAccordionItem
        v-for="(slide, index) in slides"
        :key="slide.localId"
        :accordion-id="`slide-${slide.localId}`"
        :title="slideAccordionTitle(slide, index)"
        :preview-url="previewUrl(slide) ?? null"
        :preview-alt="slide.imageAlt ?? slide.title ?? slide.label ?? `Slide ${index + 1}`"
        :media-type="slide.mediaType"
        :preview-broken="isPreviewBroken(slide.localId)"
        :move-up-disabled="disabled || gallerySaveState === 'saving' || index === 0"
        :move-down-disabled="disabled || gallerySaveState === 'saving' || index === slides.length - 1"
        :remove-disabled="disabled || gallerySaveState === 'saving'"
        class="flight-plan-gallery-editor__slide"
        @preview-error="markPreviewBroken(slide.localId)"
        @move-up="moveSlide(index, -1)"
        @move-down="moveSlide(index, 1)"
        @remove="removeSlide(index)"
      >
        <template #fields>
          <div class="flight-plan-gallery-editor__basic-fields">
            <div class="flight-plan-gallery-editor__source-hint">
              <UiText v-if="slide.imageType === 'url'" variant="muted">
                This slide uses an external URL. Edit the source in Advanced.
              </UiText>
              <UiText v-else variant="muted">
                Upload files using the uploader above. To replace this media, remove this slide and upload again.
              </UiText>
            </div>
            <UiText v-if="slide.errorMessage" class="flight-plan-gallery-editor__error">
              {{ slide.errorMessage }}
            </UiText>

            <UiFormField label="Title">
              <template #default="{ id }">
                <UiTextInput
                  :id="id"
                  :model-value="slide.title"
                  :disabled="disabled"
                  placeholder="Optional heading shown with the slide."
                  @update:model-value="(value) => updateSlide(index, { title: value })"
                />
              </template>
            </UiFormField>

            <div class="flight-plan-gallery-editor__alt">
              <UiFormField label="Alt text" :required="true">
                <template #default="{ id }">
                  <UiTextArea
                    :id="id"
                    rows="2"
                    :model-value="slide.imageAlt"
                    :disabled="disabled"
                    placeholder="Describe the media for screen readers."
                    @update:model-value="(value) => updateSlide(index, { imageAlt: value })"
                  />
                </template>
              </UiFormField>
            </div>
          </div>

          <UiAccordion
            :items="[{ id: `advanced-${slide.localId}`, title: 'Advanced' }]"
            class="flight-plan-gallery-editor__advanced"
          >
            <template #item>
              <div class="flight-plan-gallery-editor__advanced-fields">
                <UiFormField label="Media source">
                  <template #default="{ id }">
                    <UiSelect
                      :id="id"
                      :model-value="slide.imageType"
                      :disabled="disabled"
                      :options="imageTypeOptions"
                      @update:model-value="(value) => setImageType(index, value)"
                    />
                  </template>
                </UiFormField>

                <UiFormField label="Media type">
                  <template #default="{ id }">
                    <UiSelect
                      :id="id"
                      :model-value="slide.mediaType"
                      :disabled="disabled"
                      :options="mediaTypeOptions"
                      @update:model-value="(value) => setMediaType(index, value)"
                    />
                  </template>
                </UiFormField>

                <UiFormField v-if="slide.imageType === 'url'" label="Media URL" :required="true">
                  <template #default="{ id }">
                    <UiTextInput
                      :id="id"
                      :model-value="slide.imageUrl"
                      :disabled="disabled"
                      placeholder="https://example.com/asset"
                      @update:model-value="(value) => updateSlide(index, { imageUrl: value })"
                    />
                  </template>
                </UiFormField>

                <UiFormField label="Label">
                  <template #default="{ id }">
                    <UiTextInput
                      :id="id"
                      :model-value="slide.label"
                      :disabled="disabled"
                      @update:model-value="(value) => updateSlide(index, { label: value })"
                    />
                  </template>
                </UiFormField>

                <UiFormField label="Description">
                  <template #default="{ id }">
                    <UiTextArea
                      :id="id"
                      rows="2"
                      :model-value="slide.description"
                      :disabled="disabled"
                      placeholder="Add helpful context for reviewers."
                      @update:model-value="(value) => updateSlide(index, { description: value })"
                    />
                  </template>
                </UiFormField>

                <UiFormField label="Credit label">
                  <template #default="{ id }">
                    <UiTextInput
                      :id="id"
                      :model-value="slide.creditLabel"
                      :disabled="disabled"
                      placeholder="Illustrator, studio, etc."
                      @update:model-value="(value) => updateSlide(index, { creditLabel: value })"
                    />
                  </template>
                </UiFormField>
                <UiFormField label="Credit URL">
                  <template #default="{ id }">
                    <UiTextInput
                      :id="id"
                      :model-value="slide.creditUrl"
                      :disabled="disabled"
                      placeholder="https://"
                      @update:model-value="(value) => updateSlide(index, { creditUrl: value })"
                    />
                  </template>
                </UiFormField>
              </div>
            </template>
          </UiAccordion>
        </template>
      </GallerySlideAccordionItem>
    </div>
    <UiText v-else variant="muted">No gallery slides yet.</UiText>

    <UiButton
      type="button"
      variant="secondary"
      :disabled="!canAddSlide"
      class="flight-plan-gallery-editor__add"
      data-testid="gallery-add-slide"
      @click="addSlide"
    >
      Add URL slide
    </UiButton>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, unref, watch } from 'vue';
import { GALLERY_MEDIA_SOURCE_PREFIXES } from '@astralpirates/shared/mediaUrls';
import {
  UiAccordion,
  UiButton,
  UiFormField,
  UiHeading,
  UiInline,
  UiSelect,
  UiText,
  UiTextArea,
  UiTextInput,
} from '~/components/ui';
import { useEditorDocumentLock } from '~/composables/useEditorDocumentLock';
import { useSessionStore } from '~/stores/session';
import { deleteFlightPlanGalleryImage, updateFlightPlan } from '~/domains/flightPlans';
import {
  extractEditorWriteErrorCode,
  extractEditorWriteErrorMessage,
  extractEditorWriteLock,
} from '~/modules/editor/locks';
import {
  createGallerySlideDraft,
  stripDraftMetadata,
  type FlightPlanGallerySlideInput,
  type FlightPlanGallerySlideDraft,
} from './types';
import FlightPlanGalleryUploader from './FlightPlanGalleryUploader.vue';
import GallerySlideAccordionItem from '~/components/gallery/GallerySlideAccordionItem.vue';
import { resolveGalleryUploadDisplayUrl } from '~/modules/media/galleryUrls';
import {
  normalizeGalleryMediaType,
} from '~/modules/media/galleryMedia';
import { asStatusCode } from '~/modules/media/galleryRequestErrors';

const props = withDefaults(
  defineProps<{
    modelValue?: FlightPlanGallerySlideDraft[];
    disabled?: boolean;
    readonlyHelp?: string;
    maxSlides?: number;
    flightPlanId?: number | null;
    flightPlanSlug?: string | null;
    baseRevision?: number | null;
    autoSave?: boolean;
  }>(),
  {
    modelValue: () => [],
    disabled: false,
    readonlyHelp: '',
    maxSlides: 8,
    flightPlanId: null,
    flightPlanSlug: null,
    baseRevision: null,
    autoSave: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [FlightPlanGallerySlideDraft[]];
}>();

const auth = useSessionStore();
const bearer = computed(() => auth.bearerToken);
const slides = computed(() => props.modelValue ?? []);
const slidesPayload = computed(() => stripDraftMetadata(slides.value));
const slidesPayloadHash = computed(() => JSON.stringify(slidesPayload.value));
const canAddSlide = computed(() => !props.disabled && slides.value.length < props.maxSlides);
const canUpload = computed(() => Boolean(props.flightPlanId));
const uploaderEnabled = computed(() => !props.disabled && canUpload.value);
const remainingSlots = computed(() => Math.max(props.maxSlides - slides.value.length, 0));
const currentRevision = ref<number | null>(null);
const editorLock = useEditorDocumentLock();
const lockRequired = computed(() =>
  !props.disabled &&
  typeof props.flightPlanId === 'number' &&
  Number.isFinite(props.flightPlanId) &&
  props.flightPlanId > 0,
);
const gallerySaveBlockedByLock = computed(
  () =>
    lockRequired.value &&
    (editorLock.status.value === 'acquiring' || editorLock.status.value === 'locked_by_other'),
);
const canSaveGallery = computed(
  () =>
    !props.disabled &&
    Boolean(props.flightPlanSlug) &&
    currentRevision.value != null &&
    !gallerySaveBlockedByLock.value,
);
const imageTypeOptions = [
  { label: 'Upload file', value: 'upload' },
  { label: 'External URL', value: 'url' },
];
const mediaTypeOptions = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: '3D model', value: 'model' },
];

type GallerySaveState = 'idle' | 'saving' | 'error';
type GallerySaveReason = 'manual' | 'autosave' | 'reorder' | 'remove' | 'upload';
type PendingGalleryRemoval = {
  previousSlides: FlightPlanGallerySlideDraft[];
  nextHash: string;
  removedImageId: number | null;
};

const gallerySaveState = ref<GallerySaveState>('idle');
const gallerySaveError = ref('');
const lastSavedHash = ref<string | null>(null);
const lastLocalHash = ref<string | null>(null);
const queuedGallerySave = ref<{
  hash: string;
  payload: FlightPlanGallerySlideInput[];
  reason: GallerySaveReason;
} | null>(null);
const savingGallery = ref(false);
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const brokenPreviewIds = ref<Set<string>>(new Set());
const pendingGalleryRemoval = ref<PendingGalleryRemoval | null>(null);

const formatLockExpiry = (value: string | null | undefined): string => {
  if (!value) return 'soon';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'soon';
  try {
    return new Date(parsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'soon';
  }
};

const galleryLockNotice = computed(() => {
  if (!lockRequired.value) return '';
  if (editorLock.status.value === 'acquiring') {
    return 'Acquiring mission editor lock…';
  }
  if (editorLock.status.value === 'locked_by_other') {
    const expiresAt = formatLockExpiry(editorLock.lock.value?.expiresAt);
    return `Another editor session holds the mission lock until ${expiresAt}. Saving is blocked.`;
  }
  if (editorLock.status.value === 'error') {
    return editorLock.errorMessage.value || 'Unable to verify editor lock right now.';
  }
  return '';
});

const galleryLockNoticeIsError = computed(
  () => editorLock.status.value === 'locked_by_other' || editorLock.status.value === 'error',
);

const galleryLockTakeoverVisible = computed(
  () => lockRequired.value && editorLock.status.value === 'locked_by_other',
);

const syncGalleryLock = async () => {
  if (!lockRequired.value) {
    await editorLock.release();
    return;
  }
  await editorLock.start({
    documentType: 'flight-plan',
    documentId: props.flightPlanId as number,
    authToken: unref(bearer),
    lockMode: 'soft',
  });
};

onBeforeUnmount(() => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  void editorLock.release();
});

const galleryHasUnsavedChanges = computed(
  () => lastSavedHash.value !== null && slidesPayloadHash.value !== lastSavedHash.value,
);

const gallerySaveStatus = computed(() => {
  if (currentRevision.value == null) return 'Reload mission to enable saving.';
  if (gallerySaveBlockedByLock.value) {
    return 'Saving blocked by another editor lock.';
  }
  if (!canSaveGallery.value) return 'Save the mission to enable gallery saving.';
  if (gallerySaveState.value === 'saving') return 'Saving…';
  if (gallerySaveError.value) return 'Gallery not saved.';
  if (galleryHasUnsavedChanges.value) return 'Unsaved changes.';
  return 'Saved.';
});

watch(
  () => props.baseRevision,
  (nextRevision) => {
    if (typeof nextRevision === 'number' && Number.isFinite(nextRevision) && nextRevision > 0) {
      currentRevision.value = Math.trunc(nextRevision);
      return;
    }
    currentRevision.value = null;
  },
  { immediate: true },
);

watch(
  [() => props.disabled, () => props.flightPlanId, bearer],
  () => {
    void syncGalleryLock();
  },
  { immediate: true },
);

watch(
  slidesPayloadHash,
  (nextHash) => {
    if (lastSavedHash.value === null) {
      lastSavedHash.value = nextHash;
      return;
    }
    if (lastLocalHash.value && nextHash === lastLocalHash.value) return;

    lastSavedHash.value = nextHash;
    gallerySaveState.value = 'idle';
    gallerySaveError.value = '';
    queuedGallerySave.value = null;
    if (pendingGalleryRemoval.value?.nextHash === nextHash) {
      pendingGalleryRemoval.value = null;
    }
  },
  { immediate: true },
);

watch(
  () => slides.value.map((slide) => slide.localId),
  (ids) => {
    const validIds = new Set(ids);
    const next = new Set(
      Array.from(brokenPreviewIds.value).filter((id) => validIds.has(id)),
    );
    if (next.size !== brokenPreviewIds.value.size) {
      brokenPreviewIds.value = next;
    }
  },
  { immediate: true },
);

const previewUrl = (slide: FlightPlanGallerySlideDraft): string | undefined => {
  const resolved = resolveGalleryUploadDisplayUrl({
    imageType: slide.imageType,
    imageUrl: slide.imageUrl || slide.asset?.url || '',
    asset: slide.asset,
  });
  return resolved || undefined;
};

const isPreviewBroken = (localId: string): boolean => brokenPreviewIds.value.has(localId);

const markPreviewBroken = (localId: string) => {
  if (brokenPreviewIds.value.has(localId)) return;
  const next = new Set(brokenPreviewIds.value);
  next.add(localId);
  brokenPreviewIds.value = next;
};

const clearPreviewBroken = (localId: string) => {
  if (!brokenPreviewIds.value.has(localId)) return;
  const next = new Set(brokenPreviewIds.value);
  next.delete(localId);
  brokenPreviewIds.value = next;
};

const slideAccordionTitle = (
  slide: FlightPlanGallerySlideDraft,
  index: number,
): string => {
  const label = (slide.title || slide.label || '').trim();
  if (label.length > 0) return `Slide ${index + 1}: ${label}`;
  if (slide.mediaType === 'video') return `Slide ${index + 1}: Video`;
  if (slide.mediaType === 'audio') return `Slide ${index + 1}: Audio`;
  if (slide.mediaType === 'model') return `Slide ${index + 1}: 3D model`;
  return `Slide ${index + 1}: Image`;
};

const looksLikeGalleryUploadUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const hasGalleryPrefix = (pathname: string): boolean =>
    GALLERY_MEDIA_SOURCE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (hasGalleryPrefix(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return hasGalleryPrefix(parsed.pathname);
  } catch {
    return false;
  }
};

const emitSlides = (next: FlightPlanGallerySlideDraft[]) => {
  lastLocalHash.value = JSON.stringify(stripDraftMetadata(next));
  emit('update:modelValue', next);
};

const normalizeSlideUploadImageId = (
  slide: FlightPlanGallerySlideDraft | undefined,
): number | null => {
  if (!slide || slide.imageType !== 'upload') return null;
  if (typeof slide.galleryImage === 'number' && Number.isFinite(slide.galleryImage)) {
    return slide.galleryImage;
  }
  const assetId = slide.asset?.id;
  if (typeof assetId === 'number' && Number.isFinite(assetId)) {
    return assetId;
  }
  return null;
};

const deleteRemovedGalleryImage = async (imageId: number) => {
  try {
    await deleteFlightPlanGalleryImage({
      auth: unref(bearer),
      imageId,
    });
  } catch (error: any) {
    const message =
      error?.statusMessage || error?.data?.error || error?.message || 'Unable to remove media file.';
    gallerySaveState.value = 'error';
    gallerySaveError.value = `Slide removed, but media cleanup failed: ${message}`;
  }
};

const updateSlide = (
  index: number,
  patch: Partial<FlightPlanGallerySlideDraft>,
): FlightPlanGallerySlideDraft[] => {
  const target = slides.value[index];
  if (
    target &&
    ('imageType' in patch || 'imageUrl' in patch || 'galleryImage' in patch || 'asset' in patch)
  ) {
    clearPreviewBroken(target.localId);
  }
  const next = slides.value.map((slide, idx) => (idx === index ? { ...slide, ...patch } : slide));
  emitSlides(next);
  return next;
};

const handleUploadedSlides = (newSlides: FlightPlanGallerySlideDraft[]) => {
  if (!Array.isArray(newSlides) || !newSlides.length) return;
  const capacity = Math.max(props.maxSlides - slides.value.length, 0);
  if (!capacity) return;
  const nextSlides = newSlides.slice(0, capacity);
  const next = [...slides.value, ...nextSlides];
  emitSlides(next);
  requestGalleryAutoSave(next, { reason: 'upload' });
};

const addSlide = () => {
  if (!canAddSlide.value) return;
  emitSlides([...slides.value, createGallerySlideDraft({ imageType: 'url' })]);
};

const removeSlide = (index: number) => {
  if (props.disabled || gallerySaveState.value === 'saving') return;
  const removedSlide = slides.value[index];
  if (!removedSlide) return;
  const previousSlides = [...slides.value];
  const next = slides.value.filter((_, idx) => idx !== index);
  if (props.autoSave && canSaveGallery.value) {
    pendingGalleryRemoval.value = {
      previousSlides,
      nextHash: JSON.stringify(stripDraftMetadata(next)),
      removedImageId: normalizeSlideUploadImageId(removedSlide),
    };
  } else {
    pendingGalleryRemoval.value = null;
  }
  emitSlides(next);
  requestGalleryAutoSave(next, { reason: 'remove' });
};

const moveSlide = (index: number, direction: -1 | 1) => {
  if (props.disabled) return;
  const target = index + direction;
  if (target < 0 || target >= slides.value.length) return;
  const next = [...slides.value];
  const [entry] = next.splice(index, 1);
  if (!entry) return;
  next.splice(target, 0, entry);
  emitSlides(next);
  requestGalleryAutoSave(next, { debounceMs: 500, reason: 'reorder' });
};

const setImageType = (index: number, value: string | number) => {
  const normalizedValue = typeof value === 'string' ? value : String(value);
  const nextType = normalizedValue === 'url' ? 'url' : 'upload';
  const current = slides.value[index];
  if (!current) return;
  const shouldClearUrlOnSwitch =
    nextType === 'url' &&
    (Boolean(current.asset?.url && current.imageUrl === current.asset.url) ||
      looksLikeGalleryUploadUrl(current.imageUrl));
  const patch: Partial<FlightPlanGallerySlideDraft> =
    nextType === 'url'
      ? {
          imageType: 'url',
          galleryImage: null,
          asset: null,
          imageUrl: shouldClearUrlOnSwitch ? '' : current.imageUrl,
        }
      : {
          imageType: 'upload',
        };
  updateSlide(index, patch);
};

const setMediaType = (index: number, value: string | number) => {
  const normalizedValue = typeof value === 'string' ? value : String(value);
  const mediaType = normalizeGalleryMediaType(normalizedValue) ?? 'image';
  updateSlide(index, { mediaType });
};

const validateGalleryPayload = (payload: FlightPlanGallerySlideInput[]): string | null => {
  for (let idx = 0; idx < payload.length; idx += 1) {
    const slide = payload[idx]!;
    if (!slide.imageAlt?.trim()) {
      return `Slide ${idx + 1}: alt text is required.`;
    }
    if (slide.imageType === 'url') {
      const url = slide.imageUrl?.trim();
      if (!url) {
        return `Slide ${idx + 1}: media URL is required.`;
      }
      if (typeof window !== 'undefined') {
        try {
          new URL(url, window.location.origin);
        } catch {
          return `Slide ${idx + 1}: media URL must be valid.`;
        }
      }
    } else {
      const hasUploadId =
        typeof slide.galleryImage === 'number' && Number.isFinite(slide.galleryImage);
      const hasUploadUrl = typeof slide.imageUrl === 'string' && slide.imageUrl.trim().length > 0;
      if (!hasUploadId && !hasUploadUrl) {
        return `Slide ${idx + 1}: upload media (or switch to URL).`;
      }
    }
  }
  return null;
};

const runGallerySave = async () => {
  if (savingGallery.value) return;
  if (!canSaveGallery.value || !props.flightPlanSlug) return;
  if (!queuedGallerySave.value) return;
  if (currentRevision.value == null) return;

  const queued = queuedGallerySave.value;
  savingGallery.value = true;
  gallerySaveState.value = 'saving';
  gallerySaveError.value = '';

  try {
    const response = await updateFlightPlan<{ revision?: number }>({
      auth: unref(bearer),
      slug: props.flightPlanSlug,
      payload: { gallerySlides: queued.payload },
      baseRevision: currentRevision.value,
    });
    const nextRevision =
      typeof response?.revision === 'number' && Number.isFinite(response.revision)
        ? Math.trunc(response.revision)
        : null;
    if (nextRevision && nextRevision > 0) {
      currentRevision.value = nextRevision;
    } else if (currentRevision.value != null) {
      currentRevision.value += 1;
    }
    lastSavedHash.value = queued.hash;
    gallerySaveState.value = 'idle';
    if (pendingGalleryRemoval.value?.nextHash === queued.hash) {
      const removal = pendingGalleryRemoval.value;
      pendingGalleryRemoval.value = null;
      if (removal.removedImageId != null) {
        void deleteRemovedGalleryImage(removal.removedImageId);
      }
    }
  } catch (err: any) {
    const statusCode = asStatusCode(err);
    const errorCode = extractEditorWriteErrorCode(err);
    const lock = extractEditorWriteLock(err);
    let saveMessage = extractEditorWriteErrorMessage(err, 'Unable to save gallery.');

    if (statusCode === 409 && errorCode === 'revision_conflict') {
      saveMessage = 'Mission changed on the server. Reload the mission and retry your gallery save.';
    }
    if ((statusCode === 423 || errorCode === 'editor_locked') && lock) {
      editorLock.setForeignLock(lock, saveMessage);
      saveMessage = `Mission is locked by another editor session until ${formatLockExpiry(lock.expiresAt)}.`;
    }

    gallerySaveState.value = 'error';
    if (queued.reason === 'reorder') {
      gallerySaveError.value = `${saveMessage} Slide order changed locally only and will revert after reload.`;
    } else {
      gallerySaveError.value = saveMessage;
    }
    if (pendingGalleryRemoval.value?.nextHash === queued.hash) {
      const removal = pendingGalleryRemoval.value;
      pendingGalleryRemoval.value = null;
      emitSlides(removal.previousSlides);
      gallerySaveError.value = `${saveMessage} Slide removal was reverted.`;
    }
  } finally {
    savingGallery.value = false;
    if (queuedGallerySave.value && queuedGallerySave.value.hash !== queued.hash) {
      void runGallerySave();
    }
  }
};

const requestGallerySave = (
  drafts: FlightPlanGallerySlideDraft[],
  options?: { debounceMs?: number; skipValidation?: boolean; reason?: GallerySaveReason },
) => {
  if (!canSaveGallery.value) {
    if (gallerySaveBlockedByLock.value) {
      gallerySaveState.value = 'error';
      gallerySaveError.value = galleryLockNotice.value || 'Saving is blocked by another editor lock.';
    }
    return;
  }
  const payload = stripDraftMetadata(drafts);
  const hash = JSON.stringify(payload);
  if (lastSavedHash.value === hash) return;

  if (!options?.skipValidation) {
    const validationError = validateGalleryPayload(payload);
    if (validationError) {
      gallerySaveState.value = 'error';
      gallerySaveError.value = validationError;
      if (pendingGalleryRemoval.value?.nextHash === hash) {
        const removal = pendingGalleryRemoval.value;
        pendingGalleryRemoval.value = null;
        emitSlides(removal.previousSlides);
        gallerySaveError.value = `${validationError} Slide removal was reverted.`;
      }
      return;
    }
  }

  gallerySaveError.value = '';

  const enqueue = () => {
    queuedGallerySave.value = { hash, payload, reason: options?.reason ?? 'manual' };
    void runGallerySave();
  };

  const debounceMs = options?.debounceMs ?? 0;
  if (debounceMs > 0 && typeof window !== 'undefined') {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    autoSaveTimer = setTimeout(enqueue, debounceMs);
    return;
  }

  enqueue();
};

const requestGalleryAutoSave = (
  drafts: FlightPlanGallerySlideDraft[],
  options?: { debounceMs?: number; reason?: GallerySaveReason },
) => {
  if (!props.autoSave) return;
  requestGallerySave(drafts, {
    ...options,
    reason: options?.reason ?? 'autosave',
    skipValidation: true,
  });
};

const saveGallery = () => {
  requestGallerySave(slides.value);
};

const requestGalleryLockTakeover = async () => {
  if (!galleryLockTakeoverVisible.value || typeof window === 'undefined') return;
  const reason = window.prompt(
    'Take over this mission lock? Provide a short reason for the audit log.',
    'Previous editor session appears inactive.',
  );
  if (!reason || !reason.trim()) return;

  const tookOver = await editorLock.takeover(reason);
  if (tookOver) {
    gallerySaveError.value = '';
    return;
  }

  gallerySaveState.value = 'error';
  gallerySaveError.value = editorLock.errorMessage.value || 'Unable to take over mission lock.';
};
</script>

<style scoped>
.flight-plan-gallery-editor {
  --flight-plan-gallery-editor-field-min-width: calc(var(--size-base-layout-px) * 200 * var(--size-scale-factor));
  --flight-plan-gallery-editor-note-font-size: calc(var(--size-base-layout-px) * 14 * var(--size-scale-factor));
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
  border-top: var(--size-base-layout-px) solid var(--color-border-weak);
  padding-top: var(--layout-section-gap);
}

.flight-plan-gallery-editor__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  color: var(--color-text-secondary);
}

.flight-plan-gallery-editor__save {
  justify-content: space-between;
  flex-wrap: wrap;
}

.flight-plan-gallery-editor__readonly {
  font-style: italic;
  color: var(--color-text-meta);
}

.flight-plan-gallery-editor__lock-notice {
  font-size: var(--flight-plan-gallery-editor-note-font-size);
  color: var(--color-text-secondary);
}

.flight-plan-gallery-editor__lock-notice--error {
  color: var(--color-danger);
}

.flight-plan-gallery-editor__takeover {
  justify-content: flex-start;
}

.flight-plan-gallery-editor__list {
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
  color: var(--color-text-secondary);
}

.flight-plan-gallery-editor__slide {
  display: block;
}

.flight-plan-gallery-editor__error {
  color: var(--color-danger);
  font-size: var(--flight-plan-gallery-editor-note-font-size);
}

.flight-plan-gallery-editor__basic-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--flight-plan-gallery-editor-field-min-width), 1fr));
  gap: var(--layout-section-gap);
}

.flight-plan-gallery-editor__source-hint {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2xs);
}

.flight-plan-gallery-editor__alt {
  grid-column: 1 / -1;
}

.flight-plan-gallery-editor__advanced-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--flight-plan-gallery-editor-field-min-width), 1fr));
  gap: var(--layout-section-gap);
  padding-top: var(--space-xs);
}

.flight-plan-gallery-editor__add {
  align-self: flex-start;
}
</style>
