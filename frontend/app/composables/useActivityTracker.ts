import { computed, ref, watch } from 'vue';
import { useRouter, useState } from '#imports';
import { getRequestFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';

const WARNING_MS = 150_000;
const LOGOUT_MS = 180_000;
const HEARTBEAT_MS = 60_000;
const PING_DEBOUNCE_MS = 15_000;

const trackerState = () =>
  useState('activity-tracker', () => ({ warningVisible: false, countdown: 0, initialized: false }));

let warningTimer: number | null = null;
let logoutTimer: number | null = null;
let heartbeatInterval: number | null = null;
let countdownInterval: number | null = null;
let lastPingAt = 0;
let listenersAttached = false;
let currentRoute = '/';
let isTracking = false;
let routerAfterEachRegistered = false;
let visibilityListenerAttached = false;
let visibilityChangeHandler: (() => void) | null = null;

const countdownSeconds = () => Math.ceil((LOGOUT_MS - WARNING_MS) / 1000);

const normaliseRoute = (value: string | null | undefined) => {
  if (!value) return '/';
  const trimmed = value.trim();
  if (!trimmed) return '/';
  if (!trimmed.startsWith('/')) {
    return `/${trimmed.replace(/^\/*/, '')}`;
  }
  return trimmed;
};

export const useActivityTracker = () => {
  if (!process.client) {
    return {
      init: () => {},
      warningVisible: ref(false),
      countdown: ref(0),
      stayOnDeck: () => {},
    } as const;
  }

  const state = trackerState();
  const router = useRouter();
  const session = useSessionStore();
  const requestFetch = getRequestFetch();
  const visible = computed(() => state.value.warningVisible);
  const countdown = computed(() => state.value.countdown);
  const warningActive = () => {
    state.value.warningVisible = true;
    state.value.countdown = countdownSeconds();
    if (countdownInterval) window.clearInterval(countdownInterval);
    countdownInterval = window.setInterval(() => {
      state.value.countdown = Math.max(0, state.value.countdown - 1);
    }, 1000);
  };

  const hideWarning = () => {
    state.value.warningVisible = false;
    state.value.countdown = 0;
    if (countdownInterval) {
      window.clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  const clearTimers = () => {
    if (warningTimer) {
      window.clearTimeout(warningTimer);
      warningTimer = null;
    }
    if (logoutTimer) {
      window.clearTimeout(logoutTimer);
      logoutTimer = null;
    }
    if (heartbeatInterval) {
      window.clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (countdownInterval) {
      window.clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  const sendPing = async (routeOverride?: string | null) => {
    const now = Date.now();
    if (!session.isAuthenticated) return;
    if (!routeOverride && now - lastPingAt < PING_DEBOUNCE_MS) return;
    const route = normaliseRoute(routeOverride ?? currentRoute);
    try {
      await requestFetch('/api/activity', {
        method: 'POST',
        body: { route },
      });
      lastPingAt = now;
      currentRoute = route;
    } catch (error) {
      if (process.dev) {
        // eslint-disable-next-line no-console
        console.warn('[activity] failed to post heartbeat', error);
      }
    }
  };

  const recordActivity = (options: { forcePing?: boolean; route?: string | null } = {}) => {
    if (!session.isAuthenticated) return;
    hideWarning();
    clearTimers();
    warningTimer = window.setTimeout(() => warningActive(), WARNING_MS);
    logoutTimer = window.setTimeout(async () => {
      hideWarning();
      await session.logout();
    }, LOGOUT_MS);

    if (!heartbeatInterval) {
      heartbeatInterval = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          sendPing();
        }
      }, HEARTBEAT_MS);
    }

    if (options.forcePing || Date.now() - lastPingAt >= PING_DEBOUNCE_MS) {
      sendPing(options.route ?? currentRoute).catch(() => {});
    }
  };

  const userActivityHandler = () => recordActivity();

  const attachListeners = () => {
    if (listenersAttached) return;
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach((event) => window.addEventListener(event, userActivityHandler, { passive: true }));
    if (!visibilityListenerAttached) {
      visibilityChangeHandler =
        visibilityChangeHandler ??
        (() => {
          if (document.visibilityState === 'visible') {
            recordActivity({ forcePing: true });
          }
        });
      document.addEventListener('visibilitychange', visibilityChangeHandler);
      visibilityListenerAttached = true;
    }
    listenersAttached = true;
  };

  const detachListeners = () => {
    if (!listenersAttached) return;
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach((event) => window.removeEventListener(event, userActivityHandler));
    listenersAttached = false;
    if (visibilityListenerAttached && visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
      visibilityListenerAttached = false;
      visibilityChangeHandler = null;
    }
  };

  const startTracking = () => {
    if (isTracking) return;
    isTracking = true;
    currentRoute = normaliseRoute(router.currentRoute.value?.fullPath || '/');
    recordActivity({ forcePing: true, route: currentRoute });
    attachListeners();
  };

  const stopTracking = () => {
    if (!isTracking) return;
    isTracking = false;
    detachListeners();
    clearTimers();
    hideWarning();
  };

  const init = () => {
    if (state.value.initialized) return;
    state.value.initialized = true;

    if (!routerAfterEachRegistered) {
      router.afterEach((to) => {
        currentRoute = normaliseRoute(to.fullPath);
        recordActivity({ forcePing: true, route: currentRoute });
      });
      routerAfterEachRegistered = true;
    }

    watch(
      () => session.isAuthenticated,
      (isAuthed) => {
        if (isAuthed) {
          startTracking();
        } else {
          stopTracking();
        }
      },
      { immediate: true },
    );
  };

  const stayOnDeck = () => {
    recordActivity({ forcePing: true });
    hideWarning();
  };

  return {
    init,
    warningVisible: visible,
    countdown,
    stayOnDeck,
    recordActivity,
  } as const;
};
