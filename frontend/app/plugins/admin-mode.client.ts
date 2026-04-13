import { defineNuxtPlugin } from '#app';
import { watch } from 'vue';
import { useAdminModeStore } from '~/stores/adminMode';
import { useSessionStore } from '~/stores/session';

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const session = useSessionStore();
  const adminMode = useAdminModeStore();
  adminMode.initialise();

  watch(
    () => [session.initialised, session.isAuthenticated, session.currentUser?.role ?? null],
    ([initialised]) => {
      if (!initialised) return;
      adminMode.syncWithSession();
    },
    { immediate: true },
  );
});
