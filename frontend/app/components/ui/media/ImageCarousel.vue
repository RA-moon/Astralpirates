<template>
  <div class="ui-carousel">
    <div class="ui-carousel__viewport">
      <transition name="carousel-fade" mode="out-in">
        <figure
          :key="`slide-${currentIndex}`"
          :class="[
            'ui-carousel__slide',
            { 'ui-carousel__slide--audio': activeSlide?.mediaType === 'audio' },
          ]"
          tabindex="0"
          @click="handleSlideActivate"
          @keydown="handleSlideKeydown"
        >
          <img
            v-if="
              activeSlide &&
              activeSlideMediaType === 'image'
            "
            :src="activeSlide.imageUrl"
            :alt="activeSlide.imageAlt"
          />
          <video
            v-else-if="activeSlide && activeSlideMediaType === 'video'"
            controls
            preload="metadata"
            :aria-label="activeSlide.imageAlt"
          >
            <source :src="activeSlide.imageUrl" />
            Your browser does not support the video tag.
          </video>
          <audio
            v-else-if="activeSlide && activeSlideMediaType === 'audio'"
            controls
            preload="metadata"
            :aria-label="activeSlide.imageAlt"
          >
            <source :src="activeSlide.imageUrl" />
            Your browser does not support the audio tag.
          </audio>
          <UiModelViewer3D
            v-else-if="activeSlide && activeSlideMediaType === 'model' && canEmbedActiveModel"
            :src="activeSlide.imageUrl"
            :alt="activeSlide.imageAlt"
          />
          <div v-else-if="activeSlide && activeSlideMediaType === 'model'" class="ui-carousel__model">
            <p class="ui-carousel__model-label">{{ activeSlide.imageAlt }}</p>
            <a :href="activeSlide.imageUrl" target="_blank" rel="noopener noreferrer">
              Open 3D model
            </a>
          </div>
          <div
            v-else-if="activeSlide && activeSlideMediaType === 'unknown'"
            class="ui-carousel__unknown-media"
          >
            <p class="ui-carousel__unknown-media-label">{{ activeSlide.imageAlt }}</p>
            <a :href="activeSlide.imageUrl" target="_blank" rel="noopener noreferrer">
              Open media asset
            </a>
          </div>
          <img
            v-else-if="activeSlide"
            :src="activeSlide.imageUrl"
            :alt="activeSlide.imageAlt"
          />
          <figcaption>
            <strong>{{ activeSlide?.label }}</strong>
            <p>{{ activeSlide?.caption }}</p>
            <small v-if="activeSlide?.creditLabel">
              <template v-if="activeSlide?.creditUrl">
                <a
                  :href="activeSlide.creditUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ activeSlide.creditLabel }}
                </a>
              </template>
              <template v-else>
                {{ activeSlide.creditLabel }}
              </template>
            </small>
          </figcaption>
        </figure>
      </transition>
      <button
        type="button"
        class="ui-carousel__nav ui-carousel__nav--prev"
        :disabled="slides.length < 2"
        @click="prev"
        aria-label="Previous slide"
      >
        ‹
      </button>
      <button
        type="button"
        class="ui-carousel__nav ui-carousel__nav--next"
        :disabled="slides.length < 2"
        @click="next"
        aria-label="Next slide"
      >
        ›
      </button>
    </div>
    <div class="ui-carousel__dots">
      <button
        v-for="(slide, index) in slides"
        :key="slide.label"
        type="button"
        :aria-label="`Go to ${slide.label}`"
        :class="['ui-carousel__dot', { 'ui-carousel__dot--active': index === currentIndex }]"
        @click="goTo(index)"
      />
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isAssetZoomActiveForCarousel && activeSlide"
      class="ui-carousel-asset-zoom"
      role="dialog"
      aria-modal="false"
      aria-label="Asset zoom mode"
    >
      <section
        class="ui-carousel-asset-zoom__stage"
        aria-live="polite"
        @pointerdown="handleAssetZoomPointerDown"
        @pointerup="handleAssetZoomPointerUp"
        @pointercancel="resetAssetZoomSwipeState"
      >
        <figure
          :class="[
            'ui-carousel-asset-zoom__slide',
            { 'ui-carousel-asset-zoom__slide--audio': activeSlideMediaType === 'audio' },
          ]"
        >
          <img
            v-if="activeSlideMediaType === 'image'"
            :src="activeSlide.imageUrl"
            :alt="activeSlide.imageAlt"
          />
          <video
            v-else-if="activeSlideMediaType === 'video'"
            controls
            preload="metadata"
            :aria-label="activeSlide.imageAlt"
          >
            <source :src="activeSlide.imageUrl" />
            Your browser does not support the video tag.
          </video>
          <audio
            v-else-if="activeSlideMediaType === 'audio'"
            controls
            preload="metadata"
            :aria-label="activeSlide.imageAlt"
          >
            <source :src="activeSlide.imageUrl" />
            Your browser does not support the audio tag.
          </audio>
          <UiModelViewer3D
            v-else-if="activeSlideMediaType === 'model' && canEmbedActiveModel"
            :src="activeSlide.imageUrl"
            :alt="activeSlide.imageAlt"
          />
          <div v-else-if="activeSlideMediaType === 'model'" class="ui-carousel__model">
            <p class="ui-carousel__model-label">{{ activeSlide.imageAlt }}</p>
            <a :href="activeSlide.imageUrl" target="_blank" rel="noopener noreferrer">
              Open 3D model
            </a>
          </div>
          <div
            v-else-if="activeSlideMediaType === 'unknown'"
            class="ui-carousel__unknown-media"
          >
            <p class="ui-carousel__unknown-media-label">{{ activeSlide.imageAlt }}</p>
            <a :href="activeSlide.imageUrl" target="_blank" rel="noopener noreferrer">
              Open media asset
            </a>
          </div>
          <img v-else :src="activeSlide.imageUrl" :alt="activeSlide.imageAlt" />
          <figcaption>
            <strong>{{ activeSlide.label }}</strong>
            <p>{{ activeSlide.caption }}</p>
            <small v-if="activeSlide.creditLabel">
              <template v-if="activeSlide.creditUrl">
                <a
                  :href="activeSlide.creditUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ activeSlide.creditLabel }}
                </a>
              </template>
              <template v-else>
                {{ activeSlide.creditLabel }}
              </template>
            </small>
          </figcaption>
        </figure>

        <button
          v-if="assetZoomNavigationContract.showArrows"
          type="button"
          class="ui-carousel-asset-zoom__nav ui-carousel-asset-zoom__nav--prev"
          :disabled="!assetZoomNavigationContract.canPrev"
          @click="assetZoomNavigationContract.actions.prev"
          aria-label="Previous slide"
        >
          <span class="ui-carousel-asset-zoom__nav-icon" aria-hidden="true">‹</span>
        </button>
        <button
          v-if="assetZoomNavigationContract.showArrows"
          type="button"
          class="ui-carousel-asset-zoom__nav ui-carousel-asset-zoom__nav--next"
          :disabled="!assetZoomNavigationContract.canNext"
          @click="assetZoomNavigationContract.actions.next"
          aria-label="Next slide"
        >
          <span class="ui-carousel-asset-zoom__nav-icon" aria-hidden="true">›</span>
        </button>
      </section>

      <div class="ui-carousel-asset-zoom__dots">
        <button
          v-for="(slide, index) in slides"
          :key="`asset-zoom-${slide.label}`"
          type="button"
          :aria-label="`Go to ${slide.label}`"
          :class="['ui-carousel__dot', { 'ui-carousel__dot--active': index === currentIndex }]"
          @click="goTo(index)"
        />
      </div>
      <p class="ui-carousel-asset-zoom__hint">
        {{ assetZoomHintText }}
      </p>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isEmbeddableModelUrl } from '@astralpirates/shared/galleryMedia';
import UiModelViewer3D from './UiModelViewer3D.client.vue';
import { useStableId } from '~/composables/useStableId';
import { useAssetZoomState } from '~/composables/useAssetZoomState';
import {
  ASSET_ZOOM_NAVIGATION_POLICY,
  ASSET_ZOOM_NAVIGATION_EVENT,
  createAssetZoomNavigationContract,
  parseAssetZoomNavigationCommand,
} from '~/modules/media/assetZoomNavigationPolicy';

type CarouselMediaType = 'image' | 'video' | 'audio' | 'model';
type CarouselMediaKind = CarouselMediaType | 'unknown';
type AssetZoomSwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
};

const ASSET_ZOOM_SWIPE_THRESHOLD_PX = 56;
const ASSET_ZOOM_SWIPE_DOMINANCE_RATIO = 1.5;
const ASSET_ZOOM_SWIPE_MAX_DURATION_MS = 800;
const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export type CarouselSlide = {
  label: string;
  caption?: string;
  imageUrl: string;
  imageAlt: string;
  mediaType?: string;
  creditLabel?: string;
  creditUrl?: string;
};

const props = withDefaults(
  defineProps<{
    slides?: CarouselSlide[];
  }>(),
  {
    slides: () => [],
  },
);

const carouselId = useStableId('ui-carousel');
const currentIndex = ref(0);
const activeSlide = computed(() => props.slides[currentIndex.value]);
const activeSlideMediaType = computed<CarouselMediaKind>(() => {
  const mediaType = activeSlide.value?.mediaType;
  if (!mediaType || mediaType === 'image') return 'image';
  if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'model') {
    return mediaType;
  }
  return 'unknown';
});
const canEmbedActiveModel = computed(() => {
  const slide = activeSlide.value;
  if (!slide || activeSlideMediaType.value !== 'model') return false;
  return isEmbeddableModelUrl(slide.imageUrl);
});

const { isAssetZoomActive, activeAssetZoomSourceId, openAssetZoom, closeAssetZoom } =
  useAssetZoomState();
const isAssetZoomActiveForCarousel = computed(
  () => isAssetZoomActive.value && activeAssetZoomSourceId.value === carouselId,
);

const openAssetZoomForCarousel = ({ sourceEvent }: { sourceEvent?: Event } = {}) => {
  if (!activeSlide.value) return;
  const currentTarget = sourceEvent?.currentTarget;
  if (currentTarget instanceof HTMLElement) {
    sourceElement.value = currentTarget;
  }
  openAssetZoom({
    sourceId: carouselId,
  });
};

const closeAssetZoomForCarousel = ({ syncMenuObject = true }: { syncMenuObject?: boolean } = {}) => {
  if (!isAssetZoomActiveForCarousel.value) return;
  closeAssetZoom({
    sourceId: carouselId,
    syncMenuObject,
  });
  if (sourceElement.value) {
    sourceElement.value.focus({ preventScroll: true });
  }
};

const sourceElement = ref<HTMLElement | null>(null);
const assetZoomSwipeState = ref<AssetZoomSwipeState | null>(null);

const isZoomIgnoredTarget = (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('a, button, input, textarea, select, [data-no-asset-zoom]'));
};

const isAssetZoomSwipeIgnoredTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('a, button, input, textarea, select, audio, video, [data-no-asset-zoom-swipe]'),
  );
};

const resetAssetZoomSwipeState = () => {
  assetZoomSwipeState.value = null;
};

const handleSlideActivate = (event: MouseEvent) => {
  if (!activeSlide.value) return;
  if (isZoomIgnoredTarget(event)) return;
  openAssetZoomForCarousel({ sourceEvent: event });
};

const handleSlideKeydown = (event: KeyboardEvent) => {
  if (!activeSlide.value) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openAssetZoomForCarousel({ sourceEvent: event });
};

const handleAssetZoomKeydown = (event: KeyboardEvent) => {
  if (!isAssetZoomActiveForCarousel.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAssetZoomForCarousel();
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    prev();
  }
};

const handleMenuToggle = (event: Event) => {
  if (!isAssetZoomActiveForCarousel.value) return;
  const detail = (event as CustomEvent<{ source?: string }>).detail || {};
  if (detail.source !== 'menu-icon') return;
  closeAssetZoomForCarousel({ syncMenuObject: false });
};

const handleAssetZoomNavigationEvent = (event: Event) => {
  if (!isAssetZoomActiveForCarousel.value) return;
  const detail = (event as CustomEvent<{ action?: string; index?: number; source?: string }>).detail;
  const command = parseAssetZoomNavigationCommand(detail);
  if (!command) return;
  if (command.action === 'prev') {
    prev();
    return;
  }
  if (command.action === 'next') {
    next();
    return;
  }
  goTo(command.index);
};

const handleAssetZoomPointerDown = (event: PointerEvent) => {
  if (!isAssetZoomActiveForCarousel.value) return;
  if (!ASSET_ZOOM_NAVIGATION_POLICY.gestures.swipeEnabled) return;
  if (assetZoomNavigationContract.value.isSingle) return;
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  if (isAssetZoomSwipeIgnoredTarget(event.target)) return;
  assetZoomSwipeState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: getNow(),
  };
};

const handleAssetZoomPointerUp = (event: PointerEvent) => {
  const swipeState = assetZoomSwipeState.value;
  assetZoomSwipeState.value = null;
  if (!swipeState) return;
  if (!isAssetZoomActiveForCarousel.value) return;
  if (!ASSET_ZOOM_NAVIGATION_POLICY.gestures.swipeEnabled) return;
  if (assetZoomNavigationContract.value.isSingle) return;
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  if (event.pointerId !== swipeState.pointerId) return;

  const duration = getNow() - swipeState.startedAt;
  if (duration > ASSET_ZOOM_SWIPE_MAX_DURATION_MS) return;

  const deltaX = event.clientX - swipeState.startX;
  const deltaY = event.clientY - swipeState.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < ASSET_ZOOM_SWIPE_THRESHOLD_PX) return;
  if (absX < absY * ASSET_ZOOM_SWIPE_DOMINANCE_RATIO) return;

  if (deltaX < 0) {
    next();
    return;
  }

  prev();
};

const removeAssetZoomListeners = () => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleAssetZoomKeydown);
  window.removeEventListener('astral:menu-toggle', handleMenuToggle);
  window.removeEventListener(ASSET_ZOOM_NAVIGATION_EVENT, handleAssetZoomNavigationEvent);
};

watch(
  () => isAssetZoomActiveForCarousel.value,
  (active) => {
    if (typeof window === 'undefined') return;
    if (active) {
      window.addEventListener('keydown', handleAssetZoomKeydown);
      window.addEventListener('astral:menu-toggle', handleMenuToggle);
      window.addEventListener(ASSET_ZOOM_NAVIGATION_EVENT, handleAssetZoomNavigationEvent);
    } else {
      removeAssetZoomListeners();
      resetAssetZoomSwipeState();
    }
  },
  { immediate: true },
);

function next() {
  if (props.slides.length < 2) return;
  currentIndex.value = (currentIndex.value + 1) % props.slides.length;
}

function prev() {
  if (props.slides.length < 2) return;
  currentIndex.value =
    (currentIndex.value - 1 + props.slides.length) % props.slides.length;
}

function goTo(index: number) {
  if (index < 0 || index >= props.slides.length) return;
  currentIndex.value = index;
}

const assetZoomNavigationContract = computed(() =>
  createAssetZoomNavigationContract({
    slideCount: props.slides.length,
    actions: {
      prev,
      next,
      goTo,
    },
  }),
);

const assetZoomHintText = computed(() => {
  if (!assetZoomNavigationContract.value.isSingle && ASSET_ZOOM_NAVIGATION_POLICY.gestures.swipeEnabled) {
    return 'Swipe or use arrows to navigate. Click the menu object to close this asset view.';
  }
  return 'Click the menu object to close this asset view.';
});

onBeforeUnmount(() => {
  removeAssetZoomListeners();
  resetAssetZoomSwipeState();
  if (activeAssetZoomSourceId.value === carouselId) {
    closeAssetZoom({
      sourceId: carouselId,
      syncMenuObject: false,
    });
  }
});
</script>

<style scoped>
.ui-carousel {
  --ui-carousel-gap: var(--space-sm);
  --ui-carousel-border-width: var(--size-base-layout-px);
  --ui-carousel-media-max-height: calc(var(--size-base-layout-px) * 320);
  --ui-carousel-audio-padding: var(--space-sm);
  --ui-carousel-model-min-height: calc(var(--size-base-layout-px) * 220);
  --ui-carousel-panel-padding: var(--space-md);
  --ui-carousel-model-gap: var(--space-xs);
  --ui-carousel-caption-gap: var(--space-2xs);
  --ui-carousel-nav-size: calc(var(--size-base-space-rem) * 2.5);
  --ui-carousel-nav-radius: var(--radius-pill);
  --ui-carousel-nav-offset: var(--space-md);
  --ui-carousel-dot-gap: var(--crew-identity-gap);
  --ui-carousel-dot-size: var(--crew-identity-meta-font-size);
  --ui-carousel-asset-zoom-z-index: var(--z-overlay-modal);
  --ui-carousel-asset-zoom-stage-width: 100%;
  --ui-carousel-asset-zoom-stage-height: 100%;
  --ui-carousel-asset-zoom-stage-max-height: 100%;
  --ui-carousel-asset-zoom-border-width: var(--size-base-layout-px);
  --ui-carousel-asset-zoom-nav-size: calc(var(--size-base-space-rem) * 1.9);
  --ui-carousel-asset-zoom-nav-hit-width: var(--size-avatar-md);
  --ui-carousel-asset-zoom-nav-hit-height: calc(var(--size-avatar-hero) * 4.75);
  --ui-carousel-asset-zoom-nav-offset: var(--space-2xs);
  --ui-carousel-asset-zoom-nav-icon-size: calc(var(--size-base-space-rem) * 1.25);
  --ui-carousel-asset-zoom-hint-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-carousel-asset-zoom-hint-letter-spacing: var(--crew-identity-meta-letter-spacing);

  display: flex;
  flex-direction: column;
  gap: var(--ui-carousel-gap);
}

.ui-carousel__viewport {
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: var(--ui-carousel-border-width) solid var(--color-border-weak);
}

.ui-carousel__slide {
  position: relative;
  margin: 0;
  cursor: zoom-in;
  outline: none;
}

.ui-carousel__slide:focus-visible {
  box-shadow: inset 0 0 0 var(--size-base-layout-px) var(--color-accent-secondary);
}

.ui-carousel__unknown-media {
  min-height: var(--ui-carousel-model-min-height);
  padding: var(--ui-carousel-panel-padding);
  display: flex;
  flex-direction: column;
  gap: var(--ui-carousel-model-gap);
  align-items: center;
  justify-content: center;
  background: var(--color-surface-base);
  color: var(--color-text-secondary);
}

.ui-carousel__unknown-media-label {
  margin: 0;
  text-align: center;
  font-weight: 600;
}

.ui-carousel__unknown-media a {
  color: inherit;
  text-decoration: underline;
}

.ui-carousel__slide img,
.ui-carousel__slide video,
.ui-carousel__slide audio,
.ui-carousel__model {
  width: 100%;
  display: block;
  object-fit: cover;
  max-height: var(--ui-carousel-media-max-height);
}

.ui-carousel__slide audio {
  max-height: none;
  padding: var(--ui-carousel-audio-padding);
  background: var(--color-surface-base);
}

.ui-carousel__model {
  min-height: var(--ui-carousel-model-min-height);
  padding: var(--ui-carousel-panel-padding);
  display: flex;
  flex-direction: column;
  gap: var(--ui-carousel-model-gap);
  align-items: center;
  justify-content: center;
  background: var(--color-surface-base);
  color: var(--color-text-secondary);
}

.ui-carousel__model-label {
  margin: 0;
  text-align: center;
  font-weight: 600;
}

.ui-carousel__model a {
  color: inherit;
  text-decoration: underline;
}

.ui-carousel__slide figcaption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--ui-carousel-panel-padding);
  background: var(--gradient-media-caption);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--ui-carousel-caption-gap);
}

.ui-carousel__slide--audio figcaption {
  position: static;
  background: var(--color-surface-overlay);
}

.ui-carousel__slide figcaption a {
  color: inherit;
  text-decoration: underline;
}

.ui-carousel__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: var(--color-surface-overlay);
  border: none;
  color: var(--color-text-primary);
  width: var(--ui-carousel-nav-size);
  height: var(--ui-carousel-nav-size);
  border-radius: var(--ui-carousel-nav-radius);
  cursor: pointer;
}

.ui-carousel__nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ui-carousel__nav--prev {
  left: var(--ui-carousel-nav-offset);
}

.ui-carousel__nav--next {
  right: var(--ui-carousel-nav-offset);
}

.ui-carousel__dots {
  display: flex;
  justify-content: center;
  gap: var(--ui-carousel-dot-gap);
}

.ui-carousel__dot {
  width: var(--ui-carousel-dot-size);
  height: var(--ui-carousel-dot-size);
  border-radius: 50%;
  border: var(--ui-carousel-border-width) solid var(--color-border-weak);
  background: transparent;
  cursor: pointer;
}

.ui-carousel__dot--active {
  background: var(--color-accent-secondary);
  border-color: var(--color-accent-secondary);
}

.ui-carousel-asset-zoom {
  position: fixed;
  inset: 0;
  z-index: var(--ui-carousel-asset-zoom-z-index);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.ui-carousel-asset-zoom__stage {
  pointer-events: auto;
  width: var(--ui-carousel-asset-zoom-stage-width);
  height: var(--ui-carousel-asset-zoom-stage-height);
  max-height: var(--ui-carousel-asset-zoom-stage-max-height);
  border: none;
  border-radius: 0;
  overflow: hidden;
  position: relative;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: pan-y;
}

.ui-carousel-asset-zoom__slide {
  margin: 0;
  width: 100%;
  height: 100%;
}

.ui-carousel-asset-zoom__slide img,
.ui-carousel-asset-zoom__slide video,
.ui-carousel-asset-zoom__slide audio,
.ui-carousel-asset-zoom__slide .ui-carousel__model,
.ui-carousel-asset-zoom__slide .ui-carousel__unknown-media {
  width: 100%;
  height: 100%;
  display: block;
  max-height: none;
  object-fit: contain;
}

.ui-carousel-asset-zoom__slide figcaption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--space-sm);
  background: var(--gradient-media-caption);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.ui-carousel-asset-zoom__slide--audio figcaption {
  position: static;
  background: var(--color-surface-overlay);
}

.ui-carousel-asset-zoom__slide--audio {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ui-carousel-asset-zoom__slide--audio audio {
  width: calc(var(--size-avatar-hero) * 3.25);
  max-width: 100%;
  height: auto;
}

.ui-carousel-asset-zoom__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: var(--ui-carousel-asset-zoom-nav-hit-width);
  height: var(--ui-carousel-asset-zoom-nav-hit-height);
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.ui-carousel-asset-zoom__nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ui-carousel-asset-zoom__nav--prev {
  left: max(var(--ui-carousel-asset-zoom-nav-offset), env(safe-area-inset-left, 0));
  justify-content: flex-start;
}

.ui-carousel-asset-zoom__nav--next {
  right: max(var(--ui-carousel-asset-zoom-nav-offset), env(safe-area-inset-right, 0));
  justify-content: flex-end;
}

.ui-carousel-asset-zoom__nav-icon {
  width: var(--ui-carousel-asset-zoom-nav-size);
  height: var(--ui-carousel-asset-zoom-nav-size);
  border-radius: var(--radius-pill);
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
  display: grid;
  place-items: center;
  font-size: var(--ui-carousel-asset-zoom-nav-icon-size);
  font-weight: 700;
  line-height: 1;
}

.ui-carousel-asset-zoom__dots {
  pointer-events: auto;
  position: fixed;
  left: 50%;
  bottom: calc(var(--space-md) * 3);
  transform: translateX(-50%);
  display: flex;
  gap: var(--ui-carousel-dot-gap);
  justify-content: center;
}

.ui-carousel-asset-zoom__hint {
  pointer-events: none;
  margin: 0;
  position: fixed;
  left: 50%;
  bottom: var(--space-sm);
  transform: translateX(-50%);
  text-transform: uppercase;
  letter-spacing: var(--ui-carousel-asset-zoom-hint-letter-spacing);
  font-size: var(--ui-carousel-asset-zoom-hint-font-size);
  color: var(--color-text-secondary);
}

.carousel-fade-enter-active,
.carousel-fade-leave-active {
  transition: opacity 0.25s ease;
}

.carousel-fade-enter-from,
.carousel-fade-leave-to {
  opacity: 0;
}
</style>
