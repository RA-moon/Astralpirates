<template>
  <UiStack :gap="'var(--space-sm)'">
    <UiHeading :level="3" size="h4" :uppercase="false">Anchored badges</UiHeading>
    <UiText variant="muted">
      Use <code>UiBadgeAnchor</code> to attach counts or dots to icons, avatars, or action buttons.
    </UiText>

    <UiInline :gap="'var(--space-md)'">
      <UiBadgeAnchor :value="3">
        <UiIcon aria-hidden="true">🔔</UiIcon>
      </UiBadgeAnchor>

      <UiBadgeAnchor value="99+" variant="danger">
        <UiIcon aria-hidden="true">📥</UiIcon>
      </UiBadgeAnchor>

      <UiBadgeAnchor dot variant="success" :offset="4">
        <UiIcon aria-hidden="true">👤</UiIcon>
      </UiBadgeAnchor>
    </UiInline>
  </UiStack>
</template>

<script setup lang="ts">
import { UiBadgeAnchor, UiHeading, UiIcon, UiInline, UiStack, UiText } from '~/components/ui';
</script>
