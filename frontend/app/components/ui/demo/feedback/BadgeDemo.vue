<template>
  <UiStack class="ui-demo-panel" :gap="'var(--space-lg)'">
    <div>
      <UiHeading :level="3" size="h4" :uppercase="false">Count badges</UiHeading>
      <UiText variant="muted">
        Inline counters share the badge tokens so multi-select triggers, inbox pills, and nav buttons stay consistent.
      </UiText>
    </div>

    <UiInline :gap="'var(--space-sm)'" class="ui-demo-badges">
      <UiBadge :value="0" size="sm" aria-label="Zero pending items">
        0
      </UiBadge>
      <UiBadge :value="3" />
      <UiBadge :value="48" variant="muted" />
      <UiBadge :value="125" :max="99" aria-label="More than ninety nine notifications" />
    </UiInline>

    <UiInline :gap="'var(--space-sm)'" class="ui-demo-badges">
      <UiBadge variant="success" aria-label="All systems nominal">Nominal</UiBadge>
      <UiBadge variant="warning" aria-label="Needs attention">Standby</UiBadge>
      <UiBadge variant="danger" aria-label="Critical issue">Critical</UiBadge>
      <UiBadge variant="info" aria-label="New intel">Intel</UiBadge>
    </UiInline>

    <div>
      <UiHeading :level="4" size="h5" :uppercase="false">Anchored badges</UiHeading>
      <UiText variant="muted">
        Wrap avatars or icon buttons with `UiBadgeAnchor` to overlay counts without custom CSS.
      </UiText>
    </div>

    <UiInline :gap="'var(--space-md)'" class="ui-demo-badges">
      <UiBadgeAnchor :value="7" :aria-label="'Seven pending alerts'">
        <UiIconButton aria-label="Notifications">
          🔔
        </UiIconButton>
      </UiBadgeAnchor>
      <UiBadgeAnchor :value="0" :show-zero="false">
        <UiIconButton aria-label="Messages">
          💬
        </UiIconButton>
      </UiBadgeAnchor>
      <UiBadgeAnchor :value="3" position="bottom-start" variant="info" :aria-label="'Three new files'">
        <UiIconButton aria-label="Uploads">
          📁
        </UiIconButton>
      </UiBadgeAnchor>
    </UiInline>
  </UiStack>
</template>

<script setup lang="ts">
import { UiBadge, UiBadgeAnchor, UiHeading, UiIconButton, UiInline, UiStack, UiText } from '~/components/ui';
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}

.ui-demo-badges {
  flex-wrap: wrap;
}
</style>
