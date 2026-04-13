<template>
  <UiStack>
    <UiButtonGroup>
      <UiButton @click="showToast('Success', 'Flight plan published')">Show toast</UiButton>
    </UiButtonGroup>
    <UiToastRegion />
  </UiStack>
</template>

<script setup lang="ts">
import { UiButton, UiButtonGroup, UiStack, UiToastRegion } from '~/components/ui';
import { useToast } from '~/composables/useToast';

const { show } = useToast();
const showToast = (title: string, message: string) => {
  show({ title, message });
};
</script>
