import { defineNuxtPlugin } from '#app';
import { watch } from 'vue';
import { useInvitationsStore } from '~/stores/invitations';
import { useFlightPlanMutesStore } from '~/stores/flightPlanMutes';
import { useSessionStore } from '~/stores/session';
import { clearLogNeighborCache, clearMissionSummaryCache } from '~/utils/logs';

export const clearSessionDependentCaches = () => {
  clearLogNeighborCache();
  clearMissionSummaryCache();
};

export default defineNuxtPlugin(async () => {
  const session = useSessionStore();
  if (!import.meta.client) return;
  let refreshInFlight: Promise<void> | null = null;
  const refreshSessionIfAuthenticated = async () => {
    if (!session.isAuthenticated) return;
    if (refreshInFlight) {
      await refreshInFlight;
      return;
    }
    refreshInFlight = (async () => {
      await session.refresh();
    })()
      .catch(() => {})
      .finally(() => {
        refreshInFlight = null;
      });
    await refreshInFlight;
  };

  session.syncFromStorage();
  await refreshSessionIfAuthenticated();

  const invitations = useInvitationsStore();
  const flightPlanMutes = useFlightPlanMutesStore();

  window.addEventListener('storage', (event) => {
    if (event.key !== session.storageKey) return;
    session.syncFromStorage();
    clearSessionDependentCaches();
    void refreshSessionIfAuthenticated();
  });

  watch(
    () => session.isAuthenticated,
    (authenticated) => {
      clearSessionDependentCaches();
      if (authenticated) {
        invitations.fetchStatus({ silentUnauthorized: true }).catch(() => {});
        flightPlanMutes.fetchBootstrap({ silentUnauthorized: true }).catch(() => {});
      } else {
        invitations.reset();
        flightPlanMutes.reset();
      }
    },
    { immediate: true },
  );
});
