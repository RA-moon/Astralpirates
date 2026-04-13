<template>
  <component :is="as" class="ui-theme-provider">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useTheme } from '~/composables/useTheme';

const props = withDefaults(
  defineProps<{
    as?: string;
    theme?: string | null;
    themes?: string[];
  }>(),
  {
    as: 'div',
    theme: null,
    themes: () => [],
  },
);

const { setTheme, registerThemes } = useTheme();

if (props.theme) {
  setTheme(props.theme);
}

if (props.themes?.length) {
  registerThemes(props.themes, { replace: true });
}

watch(
  () => props.theme,
  (next) => {
    if (next) {
      setTheme(next);
    }
  },
);

watch(
  () => props.themes,
  (next) => {
    if (next?.length) {
      registerThemes(next, { replace: true });
    }
  },
  { deep: true },
);
</script>

<style scoped>
.ui-theme-provider {
  display: contents;
}
</style>
