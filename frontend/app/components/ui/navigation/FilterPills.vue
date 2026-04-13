<template>
  <div class="ui-filter-pills">
    <button
      v-for="pill in pills"
      :key="pill.value"
      type="button"
      class="ui-filter-pill"
      :class="{
        'ui-filter-pill--active': isActive(pill),
        'ui-filter-pill--disabled': pill.disabled,
      }"
      :disabled="pill.disabled"
      @click="handleClick(pill)"
    >
      <span class="ui-filter-pill__label">{{ pill.label }}</span>
      <UiBadge
        v-if="shouldRenderBadge(pill)"
        class="ui-filter-pill__badge"
        size="sm"
        :value="pill.badge"
        :aria-label="pill.badgeLabel ?? null"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import UiBadge from '../display/Badge.vue';

type FilterPill = {
  label: string;
  value: string;
  badge?: string | number | null;
  badgeLabel?: string;
  disabled?: boolean;
};

const props = defineProps<{
  pills: FilterPill[];
  modelValue?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isActive = (pill: FilterPill) => props.modelValue === pill.value;

const shouldRenderBadge = (pill: FilterPill) =>
  pill.badge !== null && typeof pill.badge !== 'undefined' && pill.badge !== '';

const handleClick = (pill: FilterPill) => {
  if (pill.disabled) return;
  emit('update:modelValue', pill.value);
};
</script>

<style scoped>
.ui-filter-pills {
  --ui-filter-pills-gap: var(--space-xs);
  --ui-filter-pill-border-width: var(--size-base-layout-px);
  --ui-filter-pill-padding-block: var(--crew-identity-gap);
  --ui-filter-pill-padding-inline: calc(var(--size-base-space-rem) * 0.9);
  --ui-filter-pill-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-filter-pill-font-size: var(--space-sm);
  --ui-filter-pill-inner-gap: var(--crew-identity-gap);
  --ui-filter-pill-transition-duration: var(--animation-duration-short);

  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-filter-pills-gap);
}

.ui-filter-pill {
  border: var(--ui-filter-pill-border-width) solid var(--color-border-weak);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: var(--radius-pill);
  padding: var(--ui-filter-pill-padding-block) var(--ui-filter-pill-padding-inline);
  text-transform: uppercase;
  letter-spacing: var(--ui-filter-pill-letter-spacing);
  font-size: var(--ui-filter-pill-font-size);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-filter-pill-inner-gap);
  transition:
    border-color var(--ui-filter-pill-transition-duration) var(--transition-ease-standard),
    background var(--ui-filter-pill-transition-duration) var(--transition-ease-standard);
}

.ui-filter-pill__label {
  line-height: 1.2;
}

.ui-filter-pill__badge {
  flex-shrink: 0;
}

.ui-filter-pill--active {
  background: var(--gradient-button-default);
  border-color: transparent;
}

.ui-filter-pill--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
