<template>
  <div class="site-menu-wrapper">
    <UiButton
      type="button"
      class="site-menu__toggle"
      variant="secondary"
      @click="openMenu"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
    >
      Ship layout
    </UiButton>

    <UiDrawer
      class="site-menu-drawer"
      :model-value="isOpen"
      @update:model-value="handleDrawerToggle"
      close-on-backdrop
    >
      <nav
        ref="diagramRef"
        class="site-menu-diagram"
        aria-label="Ship layout diagram"
      >
        <svg
          v-if="diagramSize.width && diagramSize.height"
          class="site-menu-diagram__connections"
          :width="diagramSize.width"
          :height="diagramSize.height"
          role="presentation"
        >
          <polyline
            v-for="connector in renderedConnectors"
            :key="connector.id"
            class="site-menu-diagram__connection"
            :points="connector.points"
          />
        </svg>

        <div
          v-for="node in menuLayout"
          :key="node.id"
          :ref="getNodeRef(node.id)"
          class="site-menu-node"
          :class="[
            `site-menu-node--area-${node.area}`,
            node.position === 'left' ? 'site-menu-node--left' : null,
            node.position === 'center' ? 'site-menu-node--center' : null,
            node.position === 'right' ? 'site-menu-node--right' : null,
            node.compact ? 'site-menu-node--compact' : null,
            verticalNodes.has(node.id) ? 'site-menu-node--vertical' : null,
          ].filter(Boolean)"
        >
          <NuxtLink
            :to="hrefFor(node.id)"
            :class="linkClasses(node.id)"
            :aria-current="isActive(node.id) ? 'page' : undefined"
            rel="nofollow"
            @click="closeMenu"
          >
            <span :class="labelClasses(node.id)" :title="props.overrides?.[node.id]?.description ?? undefined">
              {{ labelFor(node.id) }}
            </span>
          </NuxtLink>
        </div>
      </nav>
    </UiDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue';
import { useRoute } from '#imports';
import {
  siteMenuAlignment,
  siteMenuConnectors,
  siteMenuLayout,
  siteMenuLevels,
  siteMenuNodes,
  type SiteMenuLayoutEntry,
  type SiteMenuNode,
  type SiteMenuNodeId,
} from '~/components/site-menu/schema';
import { useSiteMenuState } from '~/components/site-menu/useSiteMenuState';
import { useSiteMenuDiagram } from '~/components/site-menu/useSiteMenuDiagram';
import { UiButton, UiDrawer } from '~/components/ui';
import { normaliseNavigationHref, type NavigationOverrides } from '~/utils/siteMenu';
import { normaliseRoutePath } from '~/utils/paths';

const props = defineProps<{ overrides?: NavigationOverrides }>();

const nodeMap = siteMenuNodes.reduce<Record<SiteMenuNodeId, SiteMenuNode>>((map, node) => {
  map[node.id] = node;
  return map;
}, {} as Record<SiteMenuNodeId, SiteMenuNode>);

const menuLayout: SiteMenuLayoutEntry[] = siteMenuLayout;
const verticalNodes = new Set<SiteMenuNodeId>(['gangway', 'engineering']);
const labelFor = (id: SiteMenuNodeId) => props.overrides?.[id]?.label ?? nodeMap[id].label;
const hrefFor = (id: SiteMenuNodeId) =>
  normaliseNavigationHref(props.overrides?.[id]?.href ?? nodeMap[id].href) ?? nodeMap[id].href;

const route = useRoute();

const normalizedNodePaths = computed(() =>
  siteMenuNodes.reduce<Record<SiteMenuNodeId, string>>((map, node) => {
    map[node.id] = normaliseRoutePath(hrefFor(node.id));
    return map;
  }, {} as Record<SiteMenuNodeId, string>),
);

const normalizedRoutePath = computed(() => normaliseRoutePath(route.path));

const activeNodeId = computed<SiteMenuNodeId | null>(() => {
  const current = normalizedRoutePath.value;
  const nodePaths = normalizedNodePaths.value;
  let best: { id: SiteMenuNodeId; score: number } | null = null;

  for (const node of siteMenuNodes) {
    const target = nodePaths[node.id];

    if (target === '/' && current === '/') {
      best = { id: node.id, score: Number.POSITIVE_INFINITY };
      continue;
    }

    if (current === target) {
      const score = target.length + 1000;
      if (!best || score > best.score) {
        best = { id: node.id, score };
      }
      continue;
    }

    if (current.startsWith(`${target}/`)) {
      const score = target.length;
      if (!best || score > best.score) {
        best = { id: node.id, score };
      }
    }
  }

  return best?.id ?? null;
});

const isActive = (id: SiteMenuNodeId) => activeNodeId.value === id;

const linkClasses = (id: SiteMenuNodeId, extra: string[] = []) => {
  const alignment = siteMenuAlignment[id] ?? 'center';
  const level = siteMenuLevels[id] ?? 'primary';
  return [
    'site-menu-node__link',
    ...extra,
    alignment === 'left' ? 'site-menu-node__link--align-left' : null,
    alignment === 'right' ? 'site-menu-node__link--align-right' : null,
    `site-menu-node__link--level-${level}`,
  ].filter((value): value is string => Boolean(value));
};

const labelClasses = (id: SiteMenuNodeId) => ({
  'site-menu-node__label': true,
  'site-menu-node__label--active': isActive(id),
  'site-menu-node__label--align-left': siteMenuAlignment[id] === 'left',
  'site-menu-node__label--align-right': siteMenuAlignment[id] === 'right',
  'site-menu-node__label--level-core': siteMenuLevels[id] === 'core',
  'site-menu-node__label--level-primary': siteMenuLevels[id] === 'primary',
  'site-menu-node__label--level-secondary': siteMenuLevels[id] === 'secondary',
});

const { isOpen, openMenu, closeMenu } = useSiteMenuState();
const handleDrawerToggle = (next: boolean) => {
  if (next) {
    openMenu();
  } else {
    closeMenu();
  }
};

if (process.client) {
  watch(
    () => isOpen.value,
    (open) => {
      document.body.classList.toggle('is-menu-open', open);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    document.body.classList.remove('is-menu-open');
  });
}

const { diagramRef, diagramSize, renderedConnectors, getNodeRef } = useSiteMenuDiagram({
  connectors: siteMenuConnectors,
  watchSources: [() => route.path, () => props.overrides],
  isVisible: isOpen,
});
</script>

<style scoped>
@import '~/styles/site-menu.css';
</style>
