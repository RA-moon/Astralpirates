<template>
  <UiStack :gap="'var(--space-sm)'" class="ui-demo-typography">
    <UiHeading :level="1">Heading One</UiHeading>
    <UiHeading :level="2">Heading Two</UiHeading>
    <UiHeading :level="3">Heading Three</UiHeading>
    <UiHeading :level="4">Heading Four</UiHeading>
    <UiHeading :level="5">Heading Five</UiHeading>
    <UiHeading :level="6">Heading Six</UiHeading>
    <UiDivider />
    <UiText>
      Astral Pirates blends archival storytelling with live crew updates. Body text inherits
      <code>--line-height-body</code> and the default font stack.
    </UiText>
    <UiText variant="muted">
      Muted text communicates secondary information or helper copy without extra markup in pages.
    </UiText>
    <UiText variant="eyebrow">Eyebrow label</UiText>
  </UiStack>
</template>

<script setup lang="ts">
import { UiDivider, UiHeading, UiStack, UiText } from '~/components/ui';
</script>

<style scoped>
.ui-demo-typography :deep(code) {
  font-family: inherit;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1rem 0.35rem;
  border-radius: 0.35rem;
}
</style>
