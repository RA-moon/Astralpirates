import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue';
import { useRouter } from '#app';
import {
  resolveDirectionalMap,
  type Direction,
  type DirectionalTargetMap,
  type DirectionalTarget,
} from '~/utils/directionalNavigation';
import type { SiteMenuNodeId } from '~/components/site-menu/schema';
import type { NavigationOverrides } from '~/utils/siteMenu';
import { normaliseRoutePath } from '~/utils/paths';

type MaybeComputed<T> = ComputedRef<T> | T | null | undefined;

type UseDirectionalNavigationOptions = {
  currentNodeId: ComputedRef<SiteMenuNodeId | null>;
  currentPath: ComputedRef<string>;
  overrides?: MaybeComputed<NavigationOverrides>;
  onNavigate?: (payload: { direction: Direction; target: DirectionalTarget }) => void;
  onBlocked?: (
    payload:
      | { direction: Direction; reason: 'no-target' }
      | { direction: Direction; reason: 'same-target'; target: DirectionalTarget },
  ) => void;
};

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const NAVIGATION_COOLDOWN_MS = 360;
const SWIPE_THRESHOLD_PX = 56;
const SWIPE_DOMINANCE_RATIO = 1.5;
const SWIPE_MAX_DURATION_MS = 800;

const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const unwrap = <T>(candidate: MaybeComputed<T>): T | null => {
  if (!candidate) return null;
  if (typeof (candidate as any) === 'object' && 'value' in (candidate as any)) {
    return ((candidate as ComputedRef<T>).value ?? null) as T | null;
  }
  return (candidate as T) ?? null;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return ['input', 'textarea', 'select'].includes(tag);
};

const shouldAllowVerticalSwipe = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return true;
  return !target.closest('.content-panel');
};

type SwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  target: EventTarget | null;
};

export const useDirectionalNavigation = ({
  currentNodeId,
  currentPath,
  overrides,
  onNavigate,
  onBlocked,
}: UseDirectionalNavigationOptions) => {
  const router = useRouter();
  const overridesRef = computed<NavigationOverrides>(() => unwrap(overrides) ?? {});
  const targets = computed<DirectionalTargetMap>(() =>
    resolveDirectionalMap({
      nodeId: currentNodeId.value,
      overrides: overridesRef.value,
    }),
  );
  const normalizedPath = computed(() => normaliseRoutePath(currentPath.value));
  const lastNavigationAt = ref(0);

  const navigate = (direction: Direction) => {
    const now = getNow();
    if (now - lastNavigationAt.value < NAVIGATION_COOLDOWN_MS) {
      return false;
    }
    const target = targets.value[direction];
    if (!target) {
      onBlocked?.({ direction, reason: 'no-target' });
      return false;
    }
    const targetPath = normaliseRoutePath(target.href);
    if (targetPath === normalizedPath.value) {
      onBlocked?.({ direction, reason: 'same-target', target });
      return false;
    }
    lastNavigationAt.value = now;
    onNavigate?.({ direction, target });
    router.push(target.href);
    return true;
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const direction = KEY_TO_DIRECTION[event.key];
    if (!direction) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;
    const navigated = navigate(direction);
    if (navigated) {
      event.preventDefault();
    }
  };

  const swipeStarts = new Map<number, SwipeState>();

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    swipeStarts.set(event.pointerId, {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: getNow(),
      target: event.target,
    });
  };

  const completeSwipe = (event: PointerEvent) => {
    const start = swipeStarts.get(event.pointerId);
    swipeStarts.delete(event.pointerId);
    if (!start || event.pointerType !== 'touch' || !event.isPrimary) return;

    const duration = getNow() - start.startedAt;
    if (duration > SWIPE_MAX_DURATION_MS) return;

    const deltaX = event.clientX - start.startX;
    const deltaY = event.clientY - start.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) return;

    if (absX >= absY * SWIPE_DOMINANCE_RATIO) {
      navigate(deltaX > 0 ? 'right' : 'left');
      return;
    }

    if (absY >= absX * SWIPE_DOMINANCE_RATIO && shouldAllowVerticalSwipe(start.target)) {
      navigate(deltaY > 0 ? 'down' : 'up');
    }
  };

  const cancelSwipe = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    swipeStarts.delete(event.pointerId);
  };

  if (import.meta.client) {
    onMounted(() => {
      window.addEventListener('keydown', handleKeydown, { passive: false });
      window.addEventListener('pointerdown', handlePointerDown, { passive: true });
      window.addEventListener('pointerup', completeSwipe, { passive: true });
      window.addEventListener('pointercancel', cancelSwipe, { passive: true });
    });

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', completeSwipe);
      window.removeEventListener('pointercancel', cancelSwipe);
      swipeStarts.clear();
    });
  }

  return {
    availableDirections: targets,
    navigate,
  };
};
