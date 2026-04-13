<template>
<section class="container page u-stack u-stack--page" :class="pageCssClass" :data-page-path="currentPath">
  <header v-if="heading" class="page-shell__header u-stack u-stack--section">
    <UiStack as="div" class="page-shell__title-row">
        <UiHeading :level="1" class="animated-title">{{ heading }}</UiHeading>
      </UiStack>
      <UiInline
        v-if="connections.length"
        class="page-shell__connections"
        :gap="'var(--space-sm)'"
        :align="'center'"
      >
        <UiLinkButton
          v-for="link in connections"
          :key="link.href"
          :to="link.href"
          size="sm"
          :variant="connectionVariant(link)"
        >
          {{ link.label }}
        </UiLinkButton>
      </UiInline>
      <p
        v-if="showDirectionHint && connections.length"
        class="page-shell__direction-hint"
        data-direction-hint
      >
        <span>{{ directionHintCopy }}</span>
        <UiButton
          type="button"
          variant="ghost"
          size="sm"
          class="page-shell__direction-hint-dismiss"
          @click="dismissDirectionHint"
        >
          Got it
        </UiButton>
      </p>
    </header>

    <slot />

    <ClientOnly>
      <span class="visually-hidden" aria-live="polite">{{ ariaLiveMessage }}</span>
      <PrivilegedControlsFlyout :page-data="pageData ?? null" />
      <PageEditorDrawer v-if="editorIsOpen" />
    </ClientOnly>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import type { ComputedRef } from 'vue';

import {
  siteMenuConnectors,
  siteMenuNodes,
  siteMenuLayout,
  type SiteMenuNodeId,
} from '~/components/site-menu/schema';
import { resolveFallbackHeading } from '~/utils/pageHeading';
import { normaliseNavigationHref, type NavigationOverrides, type NavigationLink } from '~/utils/siteMenu';
import type { PageDocument } from '~/modules/api/schemas';
import { normaliseRoutePath } from '~/utils/paths';
import { usePageEditorState } from '~/composables/usePageEditorState';
import { useDirectionalNavigation } from '~/composables/useDirectionalNavigation';
import PageEditorDrawer from '~/components/PageEditorDrawer.client.vue';
import PrivilegedControlsFlyout from '~/components/PrivilegedControlsFlyout.client.vue';
import { UiButton, UiHeading, UiInline, UiLinkButton, UiStack } from '~/components/ui';

const directionHintStorageKey = 'astralpirates.directionNavHintDismissed';
const directionHintCopy = 'Tip: Use \u2190 \u2191 \u2193 \u2192 or swipe to move between ship nodes.';

const props = defineProps<{
  pagePath: string;
  pageData: PageDocument | null;
  navigationOverrides?: NavigationOverrides;
  hideConnections?: boolean;
}>();

const injectedOverrides = inject<ComputedRef<NavigationOverrides> | NavigationOverrides | null>(
  'navigationOverrides',
  null,
);

const nodeByHref = new Map(siteMenuNodes.map((node) => [normaliseRoutePath(node.href), node]));
const nodeById = new Map(siteMenuNodes.map((node) => [node.id, node]));
const layoutById = new Map(siteMenuLayout.map((entry) => [entry.id, entry]));

const getCandidatePaths = (path: string): string[] => {
  const normalised = normaliseRoutePath(path);
  const segments = normalised === '/' ? [] : normalised.split('/').filter(Boolean);
  const candidates: string[] = [];
  for (let index = segments.length; index >= 0; index -= 1) {
    const slice = segments.slice(0, index);
    const candidate = slice.length > 0 ? `/${slice.join('/')}` : '/';
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
};

const resolveParentNodeIds = (
  nodeId: SiteMenuNodeId | null,
  path: string,
): SiteMenuNodeId[] => {
  const parents: SiteMenuNodeId[] = [];

  if (nodeId) {
    siteMenuConnectors
      .filter((connector) => connector.to === nodeId)
      .forEach((connector) => {
        if (!parents.includes(connector.from)) {
          parents.push(connector.from);
        }
      });
  }

  if (parents.length === 0) {
    const candidatePaths = getCandidatePaths(path).slice(1);
    for (const candidatePath of candidatePaths) {
      const candidateNode = nodeByHref.get(candidatePath);
      if (candidateNode && (!nodeId || candidateNode.id !== nodeId)) {
        parents.push(candidateNode.id as SiteMenuNodeId);
        break;
      }
    }
  }

  return parents;
};

const currentPath = computed(() => normaliseRoutePath(props.pageData?.path ?? props.pagePath));

const currentNode = computed(() => {
  const navigationNodeId = props.pageData?.navigation?.nodeId ?? null;
  if (navigationNodeId && nodeById.has(navigationNodeId as SiteMenuNodeId)) {
    return nodeById.get(navigationNodeId as SiteMenuNodeId) ?? null;
  }

  for (const candidatePath of getCandidatePaths(currentPath.value)) {
    const candidateNode = nodeByHref.get(candidatePath);
    if (candidateNode) {
      return candidateNode;
    }
  }

  return null;
});

const currentNodeId = computed<SiteMenuNodeId | null>(() => currentNode.value?.id ?? null);
const resolvedNavigationOverrides = computed<NavigationOverrides>(() => {
  const injectedValue =
    injectedOverrides && typeof (injectedOverrides as any).value !== 'undefined'
      ? (injectedOverrides as ComputedRef<NavigationOverrides>).value
      : (injectedOverrides as NavigationOverrides | null);

  if (injectedValue) return injectedValue;
  return props.navigationOverrides ?? {};
});

const hasHeroHeading = computed<boolean>(() => {
  return (
    props.pageData?.layout?.some(
      (block) =>
        block?.blockType === 'hero' &&
        typeof (block as any).title === 'string' &&
        (block as any).title.trim().length > 0,
    ) ?? false
  );
});

const heading = computed(() =>
  resolveFallbackHeading({
    pageTitle: props.pageData?.title ?? null,
    navigationLabel: props.pageData?.navigation?.label ?? null,
    hasHeroHeading: hasHeroHeading.value,
    path: currentPath.value,
  }),
);

const connections = computed<NavigationLink[]>(() => {
  if (props.hideConnections) return [];

  const nodeId = currentNodeId.value;
  const overridesValue = resolvedNavigationOverrides.value;

  const makeLink = (targetId: SiteMenuNodeId | null): NavigationLink | null => {
    if (!targetId) return null;
    if (nodeId && targetId === nodeId) return null;
    const targetNode = nodeById.get(targetId);
    if (!targetNode) return null;
    const override = overridesValue[targetNode.id];
    const layout = layoutById.get(targetNode.id);
    const href = normaliseNavigationHref(override?.href ?? targetNode.href) ?? targetNode.href;
    return {
      id: targetNode.id,
      label: override?.label ?? targetNode.label,
      href,
      level: (layout?.level ?? 'primary') as NavigationLink['level'],
      description: override?.description ?? null,
    } satisfies NavigationLink;
  };

  const links = new Map<SiteMenuNodeId, NavigationLink>();
  const addLink = (targetId: SiteMenuNodeId | null) => {
    const link = makeLink(targetId);
    if (link && !links.has(link.id)) {
      links.set(link.id, link);
    }
  };

  let hasOutgoingConnections = false;

  if (nodeId) {
    const outgoing = siteMenuConnectors.filter((connector) => connector.from === nodeId);
    hasOutgoingConnections = outgoing.length > 0;
    outgoing.forEach((connector) => addLink(connector.to));

    if (!hasOutgoingConnections) {
      siteMenuConnectors
        .filter((connector) => connector.to === nodeId)
        .forEach((connector) => addLink(connector.from));
    }
  }

  if (!hasOutgoingConnections) {
    const parentIds = resolveParentNodeIds(nodeId, currentPath.value);
    parentIds.forEach((parentId) => addLink(parentId));

    parentIds.forEach((parentId) => {
      siteMenuConnectors
        .filter((connector) => connector.from === parentId)
        .forEach((connector) => {
          if (connector.to !== nodeId) {
            addLink(connector.to);
          }
        });
    });
  }

  if (links.size === 0 && nodeId !== 'airlock') {
    addLink('airlock');
  }

  return Array.from(links.values());
});

const connectionVariant = (link: NavigationLink): 'primary' | 'secondary' | 'ghost' => {
  if (link.level === 'core') return 'primary';
  if (link.level === 'primary') return 'secondary';
  return 'ghost';
};

const pageCssClass = computed(() => {
  const path = currentPath.value.replace(/^\/+|\/+$/g, '');
  if (!path) return 'page-home';
  return `page-${path.replace(/[^a-z0-9]+/gi, '-').replace(/-+/g, '-')}`;
});

const editorState = usePageEditorState();

const editorIsOpen = computed(() => editorState.isOpen.value);

const ariaLiveMessage = ref('');
const showDirectionHint = ref(false);

const announce = (message: string) => {
  if (!import.meta.client) return;
  ariaLiveMessage.value = '';
  window.requestAnimationFrame(() => {
    ariaLiveMessage.value = message;
  });
};

const dismissDirectionHint = () => {
  showDirectionHint.value = false;
  if (import.meta.client) {
    window.localStorage.setItem(directionHintStorageKey, '1');
  }
};

const maybeShowDirectionHint = () => {
  if (!import.meta.client) return;
  const stored = window.localStorage.getItem(directionHintStorageKey);
  const shouldShow = stored !== '1';
  showDirectionHint.value = shouldShow;
  if (shouldShow) {
    announce('Directional navigation ready. Use arrow keys or swipe to move between ship nodes.');
  }
};

const directionWords: Record<'up' | 'down' | 'left' | 'right', string> = {
  up: 'above',
  down: 'below',
  left: 'to the left',
  right: 'to the right',
};

if (import.meta.client) {
  onMounted(() => {
    maybeShowDirectionHint();
  });
}

useDirectionalNavigation({
  currentNodeId,
  currentPath,
  overrides: resolvedNavigationOverrides,
  onNavigate: () => {
    if (showDirectionHint.value) {
      dismissDirectionHint();
    }
  },
  onBlocked: (payload) => {
    if (payload.reason === 'no-target') {
      announce(`No connected page ${directionWords[payload.direction]} yet.`);
    }
  },
});
</script>

<style scoped>
.page-shell__header {
  --page-shell-direction-hint-font-size: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
  --page-shell-direction-hint-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.5);
  --page-shell-direction-hint-dismiss-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.25);
  display: flex;
  flex-direction: column;
  gap: var(--layout-section-gap);
}

.page-shell__connections {
  width: 100%;
}

.page-shell__direction-hint {
  font-size: var(--page-shell-direction-hint-font-size);
  color: var(--color-text-secondary);
  margin-top: var(--space-xs);
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  letter-spacing: var(--page-shell-direction-hint-letter-spacing);
}

.page-shell__direction-hint-dismiss {
  border: none;
  background: transparent;
  color: inherit;
  text-transform: uppercase;
  letter-spacing: var(--page-shell-direction-hint-dismiss-letter-spacing);
  font-size: var(--space-sm);
  cursor: pointer;
  padding: 0;
}

.page-shell__direction-hint-dismiss:hover,
.page-shell__direction-hint-dismiss:focus-visible {
  text-decoration: underline;
}

@media (--bp-max-lg) {
  .page-shell__direction-hint {
    display: none;
  }
}
</style>
