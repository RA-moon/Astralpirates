<template>
<section class="flight-plan-gallery-uploader u-section">
    <div
      data-testid="gallery-dropzone"
      class="flight-plan-gallery-uploader__dropzone u-card"
      :class="{
        'is-disabled': !isInteractive,
        'is-dragging': isDragging,
        'is-uploading': state.isUploading,
      }"
      @click="openFilePicker"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <UiFileInput
        ref="fileInput"
        class="flight-plan-gallery-uploader__input"
        :accept="FILE_ACCEPT"
        multiple
        :disabled="!isInteractive"
        @change="handleFileChange"
      />

      <div class="flight-plan-gallery-uploader__body">
        <UiHeading :level="3" size="h6" :uppercase="false">Upload mission media</UiHeading>
        <UiText variant="muted">
          Drag files here or
          <span class="flight-plan-gallery-uploader__browse">browse</span>.
          <template v-if="availableSlots > 0">
            {{ availableSlots }} slot{{ availableSlots === 1 ? '' : 's' }} remaining.
          </template>
        </UiText>
        <UiText v-if="statusMessage" variant="muted" class="flight-plan-gallery-uploader__hint">
          {{ statusMessage }}
        </UiText>
        <UiText
          v-if="state.isUploading"
          class="flight-plan-gallery-uploader__status"
          aria-live="polite"
        >
          Uploading {{ state.uploadedCount + 1 }} / {{ state.totalCount }}…
        </UiText>
        <UiText v-if="state.error" class="flight-plan-gallery-uploader__error" role="alert">
          {{ state.error }}
        </UiText>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { UiFileInput, UiHeading, UiText } from '~/components/ui';
import { uploadFlightPlanGalleryImage } from '~/domains/flightPlans';
import {
  createGallerySlideDraft,
  type FlightPlanGallerySlideDraft,
} from './types';
import {
  GALLERY_FILE_ACCEPT,
  GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL,
} from '~/modules/media/galleryMedia';
import {
  deriveGalleryMediaTitle,
  prepareGalleryUploadCandidate,
  resolveUploadedGalleryMediaType,
} from '~/modules/media/galleryUploadWorkflow';

defineOptions({
  name: 'FlightPlanGalleryUploader',
});

const props = withDefaults(
  defineProps<{
    canUpload?: boolean;
    authToken?: string | null;
    flightPlanId?: number | null;
    remainingSlots?: number;
  }>(),
  {
    canUpload: false,
    authToken: null,
    flightPlanId: null,
    remainingSlots: 0,
  },
);

const emit = defineEmits<{
  uploaded: [FlightPlanGallerySlideDraft[]];
}>();

const FILE_ACCEPT = GALLERY_FILE_ACCEPT;

type UiFileInputInstance = InstanceType<typeof UiFileInput> & {
  input?: { value: HTMLInputElement | null };
  clear?: () => void;
};

const fileInput = ref<UiFileInputInstance | null>(null);
const dragDepth = ref(0);
const isDragging = ref(false);
const state = reactive({
  isUploading: false,
  uploadedCount: 0,
  totalCount: 0,
  error: '',
});

const availableSlots = computed(() => Math.max(props.remainingSlots ?? 0, 0));

const canSubmitUploads = computed(
  () =>
    Boolean(props.canUpload && props.flightPlanId) &&
    availableSlots.value > 0 &&
    !state.isUploading,
);

const isInteractive = computed(() => canSubmitUploads.value);

const statusMessage = computed(() => {
  if (!props.canUpload) {
    return 'You do not have permission to upload media.';
  }
  if (!props.flightPlanId) {
    return 'Save the mission before uploading media.';
  }
  if (availableSlots.value === 0) {
    return 'Gallery is full. Remove a slide to add another file.';
  }
  return `Images, videos, audio, and 3D models up to ${GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL}. Images are optimized automatically before upload.`;
});

const resetDragState = () => {
  dragDepth.value = 0;
  isDragging.value = false;
};

const handleDragEnter = () => {
  if (!isInteractive.value) return;
  dragDepth.value += 1;
  isDragging.value = true;
};

const handleDragOver = () => {
  if (!isInteractive.value) return;
  isDragging.value = true;
};

const handleDragLeave = () => {
  if (!isInteractive.value) return;
  dragDepth.value = Math.max(dragDepth.value - 1, 0);
  if (dragDepth.value === 0) {
    isDragging.value = false;
  }
};

const handleDrop = (event: DragEvent) => {
  resetDragState();
  if (!isInteractive.value) {
    if (state.isUploading) {
      state.error = 'Upload already in progress.';
    } else if (!props.canUpload) {
      state.error = 'You do not have permission to upload media.';
    } else if (!props.flightPlanId) {
      state.error = 'Save the mission before uploading media.';
    } else {
      state.error = 'Gallery is full. Remove a slide to add another file.';
    }
    return;
  }
  const files = event.dataTransfer?.files;
  if (!files || !files.length) return;
  void processFiles(Array.from(files));
};

const handleFileChange = (event: Event) => {
  if (!isInteractive.value) {
    if (state.isUploading) {
      state.error = 'Upload already in progress.';
    } else if (!props.canUpload) {
      state.error = 'You do not have permission to upload media.';
    } else if (!props.flightPlanId) {
      state.error = 'Save the mission before uploading media.';
    } else {
      state.error = 'Gallery is full. Remove a slide to add another file.';
    }
    const target = event.target as HTMLInputElement | null;
    if (target) {
      target.value = '';
    }
    fileInput.value?.clear?.();
    return;
  }

  const target = event.target as HTMLInputElement | null;
  const files = target?.files ? Array.from(target.files) : [];
  if (files.length) {
    void processFiles(files);
  }
  if (target) {
    target.value = '';
  }
  fileInput.value?.clear?.();
};

const resolveFileInputEl = (instance: UiFileInputInstance | null): HTMLInputElement | null => {
  const exposed = instance as any;
  const input = exposed?.input;
  if (!input) return null;
  if (input instanceof HTMLInputElement) return input;
  if (input && typeof input === 'object' && 'value' in input) {
    const value = (input as { value?: unknown }).value;
    return value instanceof HTMLInputElement ? value : null;
  }
  return null;
};

const openFilePicker = () => {
  if (!isInteractive.value) return;
  const input = resolveFileInputEl(fileInput.value);
  if (!input) return;
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // Fall through to click for browsers that reject showPicker.
    }
  }
  input.click();
};

const processFiles = async (files: File[]) => {
  if (!files.length) {
    return;
  }
  if (state.isUploading) {
    state.error = 'Upload already in progress.';
    return;
  }
  if (!props.flightPlanId) {
    state.error = 'Save the mission before uploading media.';
    return;
  }

  const allowedCount = availableSlots.value;
  if (!allowedCount) {
    state.error = 'Gallery is full. Remove a slide to add another file.';
    return;
  }

  const candidates = files.slice(0, allowedCount);
  const queue: Array<{ sourceFile: File; uploadFile: File }> = [];
  const validationErrors: string[] = [];

  for (const sourceFile of candidates) {
    const prepared = await prepareGalleryUploadCandidate(sourceFile);
    if (prepared.error) {
      validationErrors.push(`${sourceFile.name}: ${prepared.error}`);
      continue;
    }
    if (prepared.candidate) {
      queue.push(prepared.candidate);
    }
  }

  const queueLimitError =
    candidates.length < files.length
      ? `Only ${allowedCount} slot${allowedCount === 1 ? '' : 's'} available. Extra files were ignored.`
      : '';
  state.error = validationErrors[0] ?? queueLimitError;

  if (!queue.length) {
    return;
  }

  state.isUploading = true;
  state.totalCount = queue.length;
  state.uploadedCount = 0;

  const draftedSlides: FlightPlanGallerySlideDraft[] = [];

  for (const queued of queue) {
    const sourceFile = queued.sourceFile;
    const uploadFile = queued.uploadFile;
    try {
      const result = await uploadFlightPlanGalleryImage({
        auth: props.authToken ?? null,
        flightPlanId: props.flightPlanId!,
        file: uploadFile,
      });
      const title = deriveGalleryMediaTitle(sourceFile.name);
      draftedSlides.push(
        createGallerySlideDraft({
          mediaType: resolveUploadedGalleryMediaType({
            assetMimeType: result?.asset?.mimeType,
            assetFilename: result?.asset?.filename ?? sourceFile.name,
            imageUrl: result?.asset?.url ?? result?.imageUrl,
          }),
          imageType: 'upload',
          galleryImage: result?.asset?.id ?? null,
          imageUrl: '',
          title,
          description: '',
          imageAlt: title,
          asset: result?.asset ?? null,
        }),
      );
      state.uploadedCount += 1;
    } catch (error: any) {
      state.error = error?.message || 'Upload failed. Try again.';
      break;
    }
  }

  state.isUploading = false;
  state.totalCount = 0;
  state.uploadedCount = 0;

  if (draftedSlides.length) {
    emit('uploaded', draftedSlides);
  }
};

defineExpose({
  processFiles,
});
</script>

<style scoped>
.flight-plan-gallery-uploader {
  border-top: var(--size-base-layout-px) solid var(--color-border-weak);
  padding-top: var(--layout-section-gap);
  color: var(--color-text-secondary);
}

.flight-plan-gallery-uploader__dropzone {
  border: var(--size-base-layout-px) dashed var(--color-border-weak);
  border-radius: var(--util-radius-card);
  padding: var(--util-pad-card);
  background: var(--color-surface-panel);
  transition: border-color 0.2s ease, background 0.2s ease;
  cursor: pointer;
}

.flight-plan-gallery-uploader__dropzone.is-dragging {
  border-color: var(--color-border-focus);
  background: var(--color-surface-base);
}

.flight-plan-gallery-uploader__dropzone.is-uploading {
  opacity: 0.8;
  cursor: progress;
}

.flight-plan-gallery-uploader__dropzone.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.flight-plan-gallery-uploader__input {
  position: absolute;
  width: var(--size-base-layout-px);
  height: var(--size-base-layout-px);
  opacity: 0;
  pointer-events: none;
  left: calc(var(--radius-pill) * -10);
  top: calc(var(--radius-pill) * -10);
}

.flight-plan-gallery-uploader__body {
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
}

.flight-plan-gallery-uploader__body,
.flight-plan-gallery-uploader__body :deep(p) {
  color: var(--color-text-secondary);
}

.flight-plan-gallery-uploader__browse {
  text-decoration: underline;
}

.flight-plan-gallery-uploader__hint {
  font-size: calc(var(--size-base-layout-px) * 14 * var(--size-scale-factor));
}

.flight-plan-gallery-uploader__status {
  color: var(--color-text-secondary);
  font-weight: 600;
}

.flight-plan-gallery-uploader__error {
  color: var(--color-danger);
  font-weight: 600;
}
</style>
