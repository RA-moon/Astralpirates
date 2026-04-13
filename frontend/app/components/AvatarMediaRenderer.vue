<template>
  <div class="avatar-media" :class="{ 'avatar-media--compact': props.compact }" :data-mode="renderMode">
    <img
      v-if="renderMode === 'image'"
      class="avatar-media__image"
      :src="imageSrc"
      :alt="altText"
      loading="lazy"
      decoding="async"
      @error="handleImageError"
    />
    <video
      v-else-if="renderMode === 'video'"
      class="avatar-media__video"
      :src="videoSrc"
      :aria-label="altText"
      autoplay
      muted
      loop
      playsinline
      preload="metadata"
      @error="handleVideoError"
    />
    <UiModelViewer3D
      v-else-if="renderMode === 'model' && modelUrl && canEmbedModel"
      class="avatar-media__model"
      :src="modelUrl"
      :alt="altText || '3D avatar preview'"
    />
    <span
      v-else-if="renderMode === 'model' && modelUrl && props.compact"
      class="avatar-media__model-link avatar-media__model-link--compact"
      :aria-label="props.modelLinkLabel"
      :title="props.modelLinkLabel"
    >
      3D
    </span>
    <div
      v-else-if="renderMode === 'model' && modelUrl"
      class="avatar-media__model-link-card"
    >
      <p class="avatar-media__model-label">3D avatar</p>
      <a
        class="avatar-media__model-link"
        :href="modelUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ props.modelLinkLabel }}
      </a>
    </div>
    <img
      v-else
      class="avatar-media__image"
      :src="imageSrc"
      :alt="altText"
      loading="lazy"
      decoding="async"
      @error="handleImageError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiModelViewer3D from '~/components/ui/media/UiModelViewer3D.client.vue';
import {
  isEmbeddableAvatarModelUrl,
  normalizeAvatarMediaRecord,
  type AvatarMediaType,
} from '~/modules/media/avatarMedia';
import { isAvatarTriModeEnabled } from '~/modules/featureFlags/avatarTriMode';
import { AVATAR_FALLBACK_IMAGE_URL, resolveAvatarDisplayUrl } from '~/modules/media/avatarUrls';

const props = withDefaults(
  defineProps<{
    avatarUrl?: string | null;
    avatarMediaType?: AvatarMediaType | null;
    avatarMediaUrl?: string | null;
    avatarMimeType?: string | null;
    avatarFilename?: string | null;
    alt?: string | null;
    decorative?: boolean;
    compact?: boolean;
    modelLinkLabel?: string;
  }>(),
  {
    avatarUrl: null,
    avatarMediaType: null,
    avatarMediaUrl: null,
    avatarMimeType: null,
    avatarFilename: null,
    alt: 'Crew avatar',
    decorative: false,
    compact: false,
    modelLinkLabel: 'Open 3D avatar',
  },
);

const avatarTriModeEnabled = isAvatarTriModeEnabled();

const media = computed(() => {
  const normalized = normalizeAvatarMediaRecord({
    avatarUrl: props.avatarUrl,
    avatarMediaType: props.avatarMediaType,
    avatarMediaUrl: props.avatarMediaUrl,
    avatarMimeType: props.avatarMimeType,
    avatarFilename: props.avatarFilename,
  });

  if (!avatarTriModeEnabled) {
    const imageUrl =
      normalized.avatarMediaType === 'image'
        ? normalized.avatarUrl ?? normalized.avatarMediaUrl
        : null;
    return {
      ...normalized,
      avatarMediaType: 'image' as const,
      avatarMediaUrl: imageUrl,
    };
  }

  return normalized;
});

const resolvedMediaUrl = computed(() => media.value.avatarMediaUrl ?? media.value.avatarUrl);
const videoErrored = ref(false);
const imageSrc = ref(resolveAvatarDisplayUrl(resolvedMediaUrl.value));

watch(
  () => [resolvedMediaUrl.value, media.value.avatarMediaType],
  () => {
    imageSrc.value = resolveAvatarDisplayUrl(resolvedMediaUrl.value);
    videoErrored.value = false;
  },
  { immediate: true },
);

const altText = computed(() => {
  if (props.decorative) return '';
  return props.alt?.trim() || 'Crew avatar';
});

const modelUrl = computed(() => {
  if (media.value.avatarMediaType !== 'model') return null;
  return resolvedMediaUrl.value;
});

const canEmbedModel = computed(() => {
  if (props.compact) return false;
  if (!modelUrl.value) return false;
  return isEmbeddableAvatarModelUrl(modelUrl.value);
});

const videoSrc = computed<string | undefined>(() => {
  if (media.value.avatarMediaType !== 'video') return undefined;
  if (videoErrored.value) return undefined;
  return resolvedMediaUrl.value ?? undefined;
});

const renderMode = computed<'image' | 'video' | 'model'>(() => {
  if (media.value.avatarMediaType === 'video' && videoSrc.value) {
    return 'video';
  }
  if (media.value.avatarMediaType === 'model' && modelUrl.value) {
    return 'model';
  }
  return 'image';
});

const handleImageError = () => {
  if (imageSrc.value === AVATAR_FALLBACK_IMAGE_URL) return;
  imageSrc.value = AVATAR_FALLBACK_IMAGE_URL;
};

const handleVideoError = () => {
  videoErrored.value = true;
};
</script>

<style scoped>
.avatar-media {
  --avatar-media-card-reference-size: var(--size-avatar-sm);
  --avatar-media-model-card-padding: calc(var(--avatar-media-card-reference-size) * 0.2);
  --avatar-media-model-card-gap: var(--crew-identity-gap);
  --avatar-media-model-label-font-size: calc(var(--crew-identity-meta-font-size) * 1.1429);
  --avatar-media-model-label-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --avatar-media-model-link-font-size: calc(var(--crew-identity-meta-font-size) * 1.1714);
  --avatar-media-model-link-compact-font-size: calc(var(--crew-identity-meta-font-size) * 1.0286);
  --avatar-media-model-link-compact-letter-spacing: calc(
    var(--crew-identity-meta-letter-spacing) * 1.5
  );
  --avatar-media-model-link-compact-tight-font-size: calc(
    var(--crew-identity-meta-font-size) * 0.9714
  );
  width: 100%;
  height: 100%;
  display: block;
  background: var(--color-surface-avatar);
}

.avatar-media__image,
.avatar-media__video,
.avatar-media__model {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.avatar-media__video {
  background: var(--color-surface-avatar);
}

.avatar-media__model-link-card {
  width: 100%;
  height: 100%;
  padding: var(--avatar-media-model-card-padding);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--avatar-media-model-card-gap);
  text-align: center;
  color: var(--color-text-secondary);
  background: var(--color-surface-base);
}

.avatar-media__model-label {
  margin: 0;
  font-size: var(--avatar-media-model-label-font-size);
  text-transform: uppercase;
  letter-spacing: var(--avatar-media-model-label-letter-spacing);
}

.avatar-media__model-link {
  color: inherit;
  text-decoration: underline;
  font-size: var(--avatar-media-model-link-font-size);
}

.avatar-media__model-link--compact {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--avatar-media-model-link-compact-font-size);
  letter-spacing: var(--avatar-media-model-link-compact-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-primary);
  text-decoration: none;
  background:
    radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.22), transparent 55%),
    color-mix(in srgb, var(--color-surface-base) 70%, #041223);
}

.avatar-media--compact .avatar-media__model-link {
  font-size: var(--avatar-media-model-link-compact-tight-font-size);
}
</style>
