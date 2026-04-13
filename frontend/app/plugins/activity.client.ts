import { useActivityTracker } from '~/composables/useActivityTracker';

export default defineNuxtPlugin(() => {
  if (!process.client) return;
  const tracker = useActivityTracker();
  tracker.init();
});
