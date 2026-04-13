import { navigateTo, defineNuxtRouteMiddleware } from '#app';

export default defineNuxtRouteMiddleware((to) => {
  if (to.path.startsWith('/logbook/logs/')) {
    const slug = to.path.replace(/^\/logbook\/logs\//, '').split(/[/?#]/)[0];
    if (slug) {
      return navigateTo(`/logbook/${slug}`, { replace: true });
    }
    return navigateTo('/bridge/logbook', { replace: true });
  }
});
