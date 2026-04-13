<template>
  <UiStack>
    <UiButtonGroup>
      <UiButton>Primary</UiButton>
      <UiButton variant="secondary">Secondary</UiButton>
      <UiButton variant="ghost">Ghost</UiButton>
      <UiButton variant="destructive">Destructive</UiButton>
    </UiButtonGroup>

    <UiButtonGroup>
      <UiIconButton aria-label="Settings">
        ⚙
      </UiIconButton>
      <UiIconButton variant="ghost" aria-label="Close">
        ×
      </UiIconButton>
    </UiButtonGroup>

    <UiButtonGroup>
      <UiLinkButton to="/bridge">Bridge link</UiLinkButton>
      <UiLinkButton variant="secondary" to="/gangway">Gangway link</UiLinkButton>
    </UiButtonGroup>

    <UiFloatingAction :style="{ position: 'static', boxShadow: 'none', marginTop: '1rem' }">
      Launch
    </UiFloatingAction>
  </UiStack>
</template>

<script setup lang="ts">
import {
  UiButton,
  UiButtonGroup,
  UiFloatingAction,
  UiIconButton,
  UiLinkButton,
  UiStack,
} from '~/components/ui';
</script>
