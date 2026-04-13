import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance, Ref, VNodeRef, WatchSource } from 'vue';
import type { SiteMenuConnector, SiteMenuNodeId, Anchor } from './schema';

type ConnectorRender = {
  id: string;
  points: string;
};

type FrameHandle = ReturnType<typeof setTimeout> | number;

const requestFrame =
  typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16);

const cancelFrame: (handle: FrameHandle) => void =
  typeof globalThis.cancelAnimationFrame === 'function'
    ? (handle) => globalThis.cancelAnimationFrame(handle as number)
    : (handle) => clearTimeout(handle as unknown as number);

const anchorPoint = (rect: DOMRect, anchor: Anchor, other: DOMRect) => {
  const overlapYStart = Math.max(rect.top, other.top);
  const overlapYEnd = Math.min(rect.bottom, other.bottom);
  const overlapXStart = Math.max(rect.left, other.left);
  const overlapXEnd = Math.min(rect.right, other.right);

  switch (anchor) {
    case 'top':
      return {
        x:
          overlapXEnd > overlapXStart
            ? (overlapXStart + overlapXEnd) / 2
            : rect.left + rect.width / 2,
        y: rect.top,
      };
    case 'bottom':
      return {
        x:
          overlapXEnd > overlapXStart
            ? (overlapXStart + overlapXEnd) / 2
            : rect.left + rect.width / 2,
        y: rect.bottom,
      };
    case 'left':
      return {
        x: rect.left,
        y:
          overlapYEnd > overlapYStart
            ? (overlapYStart + overlapYEnd) / 2
            : rect.top + rect.height / 2,
      };
    case 'right':
      return {
        x: rect.right,
        y:
          overlapYEnd > overlapYStart
            ? (overlapYStart + overlapYEnd) / 2
            : rect.top + rect.height / 2,
      };
  }
};

const computePolyline = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  elbow?: SiteMenuConnector['elbow'],
) => {
  const needBend = elbow || (start.x !== end.x && start.y !== end.y);
  if (!needBend) {
    return [start, end];
  }

  const turn = elbow ?? 'hv';
  if (turn === 'vh') {
    const mid = { x: start.x, y: end.y };
    return [start, mid, end];
  }

  const mid = { x: end.x, y: start.y };
  return [start, mid, end];
};

const formatPoints = (points: Array<{ x: number; y: number }>) =>
  points.map((point) => `${point.x},${point.y}`).join(' ');

type UseSiteMenuDiagramOptions = {
  connectors: SiteMenuConnector[];
  watchSources?: WatchSource[];
  isVisible?: Ref<boolean>;
};

export const useSiteMenuDiagram = ({
  connectors,
  watchSources = [],
  isVisible,
}: UseSiteMenuDiagramOptions) => {
  const diagramRef = ref<HTMLElement | null>(null);
  const diagramSize = ref({ width: 0, height: 0 });
  const renderedConnectors = ref<ConnectorRender[]>([]);

  const nodeElements = new Map<SiteMenuNodeId, HTMLElement>();
  const nodeRefCallbacks: Map<SiteMenuNodeId, VNodeRef> = new Map();

  let pendingFrame: FrameHandle | null = null;
  let diagramObserver: ResizeObserver | null = null;
  let nodeObserver: ResizeObserver | null = null;

  const scheduleConnectorUpdate = () => {
    if (!process.client) return;
    if (pendingFrame !== null) {
      cancelFrame(pendingFrame);
    }
    pendingFrame = requestFrame(() => {
      pendingFrame = null;
      updateConnectors();
    });
  };

  const updateConnectors = () => {
    if (!process.client) return;
    const container = diagramRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const connections: ConnectorRender[] = [];

    for (const definition of connectors) {
      const startEl = nodeElements.get(definition.from);
      const endEl = nodeElements.get(definition.to);

      if (!startEl || !endEl) continue;

      const startRect = startEl.getBoundingClientRect();
      const endRect = endEl.getBoundingClientRect();

      const start = anchorPoint(startRect, definition.fromAnchor, endRect);
      const end = anchorPoint(endRect, definition.toAnchor, startRect);
      if (!start || !end) continue;

      const points = computePolyline(start, end, definition.elbow).map((point) => ({
        x: point.x - containerRect.left,
        y: point.y - containerRect.top,
      }));

      connections.push({
        id: definition.id,
        points: formatPoints(points),
      });
    }

    const nextSize = {
      width: containerRect.width,
      height: containerRect.height,
    };
    if (
      diagramSize.value.width !== nextSize.width ||
      diagramSize.value.height !== nextSize.height
    ) {
      diagramSize.value = nextSize;
    }

    const currentPoints = renderedConnectors.value.map((entry) => entry.points).join('|');
    const nextPoints = connections.map((entry) => entry.points).join('|');
    if (currentPoints !== nextPoints || renderedConnectors.value.length !== connections.length) {
      renderedConnectors.value = connections;
    }
  };

  const observeNode = (el: HTMLElement) => {
    if (!nodeObserver) return;
    nodeObserver.observe(el);
  };

  const unobserveNode = (el: HTMLElement) => {
    if (!nodeObserver) return;
    nodeObserver.unobserve(el);
  };

  const teardownObservers = () => {
    diagramObserver?.disconnect();
    nodeObserver?.disconnect();
    diagramObserver = null;
    nodeObserver = null;
  };

  const ensureObservers = () => {
    if (!process.client || typeof ResizeObserver !== 'function') {
      return;
    }

    if (!diagramObserver) {
      diagramObserver = new ResizeObserver(() => scheduleConnectorUpdate());
    }

    if (!nodeObserver) {
      nodeObserver = new ResizeObserver(() => scheduleConnectorUpdate());
    }

    if (diagramRef.value) {
      diagramObserver.observe(diagramRef.value);
    }

    for (const node of nodeElements.values()) {
      nodeObserver.observe(node);
    }
  };

  const getNodeRef = (id: SiteMenuNodeId): VNodeRef => {
    if (!nodeRefCallbacks.has(id)) {
      nodeRefCallbacks.set(id, (el: Element | ComponentPublicInstance | null) => {
        const element = el instanceof HTMLElement ? el : null;
        const current = nodeElements.get(id);
        if (current && current !== element) {
          nodeElements.delete(id);
          if (current) {
            unobserveNode(current);
          }
        }
        if (element) {
          nodeElements.set(id, element);
          observeNode(element);
        } else {
          nodeElements.delete(id);
        }
        scheduleConnectorUpdate();
      });
    }

    return nodeRefCallbacks.get(id)!;
  };

  watch(
    diagramRef,
    (next, prev) => {
      if (prev && diagramObserver) {
        diagramObserver.unobserve(prev);
      }
      if (next && diagramObserver) {
        diagramObserver.observe(next);
      }
      scheduleConnectorUpdate();
    },
    { flush: 'post' },
  );

  if (watchSources.length) {
    watch(watchSources, () => scheduleConnectorUpdate(), { flush: 'post' });
  }

  if (isVisible) {
    watch(
      isVisible,
      (visible) => {
        if (visible) {
          nextTick(() => scheduleConnectorUpdate());
        }
      },
      { flush: 'post' },
    );
  }

  onMounted(() => {
    ensureObservers();
    scheduleConnectorUpdate();
    if (process.client && typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', scheduleConnectorUpdate);
    }
  });

  onBeforeUnmount(() => {
    teardownObservers();
    if (pendingFrame !== null) {
      cancelFrame(pendingFrame);
      pendingFrame = null;
    }
    if (process.client && typeof ResizeObserver !== 'function') {
      window.removeEventListener('resize', scheduleConnectorUpdate);
    }
    nodeElements.clear();
    nodeRefCallbacks.clear();
  });

  return {
    diagramRef,
    diagramSize,
    renderedConnectors,
    getNodeRef,
    scheduleConnectorUpdate,
  };
};
