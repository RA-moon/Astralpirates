<template>
  <UiLinkButton
    v-if="!isExternal"
    :to="cta.href"
    :variant="variant"
    :size="size"
  >
    <slot>{{ cta.label }}</slot>
  </UiLinkButton>
  <UiLinkButton
    v-else
    as="a"
    :href="cta.href"
    target="_blank"
    rel="noopener noreferrer"
    :variant="variant"
    :size="size"
  >
    <slot>{{ cta.label }}</slot>
  </UiLinkButton>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { Link } from '~/modules/api/schemas';
import { resolveCtaAttributes } from '~/utils/richText';
import { UiLinkButton } from '~/components/ui';

const props = withDefaults(
  defineProps<{
    cta: Link;
    size?: 'md' | 'sm';
  }>(),
  {
    size: 'md',
  },
);

const computedAttributes = computed(() => resolveCtaAttributes(props.cta));
const variant = computed<'primary' | 'secondary' | 'ghost'>(
  () => computedAttributes.value.variant as 'primary' | 'secondary' | 'ghost',
);
const isExternal = computed(() => computedAttributes.value.isExternal);
const size = computed(() => props.size);
</script>
