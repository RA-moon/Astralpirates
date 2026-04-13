<template>
<section class="page-navigation-module u-card">
  <UiStack :gap="'var(--space-sm)'">
    <UiHeading :level="2" size="h4">
      {{ heading }}
    </UiHeading>
    <RichTextRenderer v-if="block.description?.length" :content="block.description" />
    </UiStack>

    <UiInline v-if="navigationLinks.length" class="page-navigation-module__links" :gap="'var(--space-sm)'">
      <UiLinkButton
        v-for="link in navigationLinks"
        :key="link.href"
        :to="link.href"
        size="sm"
        variant="secondary"
      >
        {{ link.label }}
      </UiLinkButton>
    </UiInline>

    <p v-else class="page-navigation-module__empty">
      No connected decks available yet. Add this page to the ship layout to surface route buttons automatically.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '#imports';

import {
  siteMenuConnectors,
  siteMenuNodes,
  type SiteMenuNodeId,
  type SiteMenuConnector,
} from '~/components/site-menu/schema';
import { UiHeading, UiInline, UiLinkButton, UiStack } from '~/components/ui';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import type { NavigationModuleBlock } from '~/modules/api/schemas';
import { normaliseRoutePath } from '~/utils/paths';

type NavigationButton = { id: string; label: string; href: string };

const props = defineProps<{
  block: NavigationModuleBlock;
}>();

const route = useRoute();

const nodeById = new Map(siteMenuNodes.map((node) => [node.id, node]));
const nodeByPath = new Map(siteMenuNodes.map((node) => [normaliseRoutePath(node.href), node]));
const connectorsFrom = new Map<SiteMenuNodeId, SiteMenuConnector[]>();
const connectorsTo = new Map<SiteMenuNodeId, SiteMenuConnector[]>();

for (const connector of siteMenuConnectors) {
  const fromList = connectorsFrom.get(connector.from) ?? [];
  fromList.push(connector);
  connectorsFrom.set(connector.from, fromList);

  const toList = connectorsTo.get(connector.to) ?? [];
  toList.push(connector);
  connectorsTo.set(connector.to, toList);
}

const getCandidatePaths = (path: string): string[] => {
  const segments =
    path === '/' ? [] : path.split('/').filter((segment) => segment.trim().length > 0);
  const candidates: string[] = [];
  for (let index = segments.length; index >= 0; index -= 1) {
    const slice = segments.slice(0, index);
    const candidate = slice.length ? `/${slice.join('/')}` : '/';
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
};

const targetPath = computed(() =>
  normaliseRoutePath(props.block.path ?? route.path ?? '/'),
);

const resolvedNodeId = computed<SiteMenuNodeId | null>(() => {
  if (props.block.nodeId && nodeById.has(props.block.nodeId as SiteMenuNodeId)) {
    return props.block.nodeId as SiteMenuNodeId;
  }
  for (const candidate of getCandidatePaths(targetPath.value)) {
    const node = nodeByPath.get(candidate);
    if (node) {
      return node.id as SiteMenuNodeId;
    }
  }
  return null;
});

const parentLink = computed<NavigationButton | null>(() => {
  const candidates = getCandidatePaths(targetPath.value).slice(1);
  for (const candidate of candidates) {
    const node = nodeByPath.get(candidate);
    if (node) {
      return {
        id: node.id,
        label: node.label,
        href: node.href,
      };
    }
    if (candidate !== targetPath.value) {
      return {
        id: candidate,
        label: candidate === '/' ? 'Return home' : candidate,
        href: candidate,
      };
    }
  }
  return null;
});

const navigationLinks = computed<NavigationButton[]>(() => {
  const buttons = new Map<string, NavigationButton>();
  const nodeId = resolvedNodeId.value;

  const addNodeLink = (targetId: SiteMenuNodeId | null) => {
    if (!targetId) return;
    const node = nodeById.get(targetId);
    if (!node) return;
    if (!buttons.has(node.id)) {
      buttons.set(node.id, { id: node.id, label: node.label, href: node.href });
    }
  };

  if (nodeId) {
    const outgoing = connectorsFrom.get(nodeId);
    if (outgoing && outgoing.length) {
      outgoing.forEach((connector) => addNodeLink(connector.to));
    }

    if (!outgoing || outgoing.length === 0) {
      const incoming = connectorsTo.get(nodeId);
      incoming?.forEach((connector) => addNodeLink(connector.from));
    }
  }

  if (buttons.size === 0 && parentLink.value) {
    buttons.set(parentLink.value.id, parentLink.value);
  }

  return Array.from(buttons.values());
});

const heading = computed(() => props.block.title ?? 'Ship navigation');
</script>

<style scoped>
.page-navigation-module {
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
  background: var(--color-surface-hero);
  box-shadow: var(--shadow-card);
}

.page-navigation-module__links {
  flex-wrap: wrap;
}

.page-navigation-module__empty {
  font-size: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
  color: var(--color-text-muted);
  margin: 0;
}
</style>
