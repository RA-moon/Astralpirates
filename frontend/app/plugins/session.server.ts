import { defineNuxtPlugin, useRuntimeConfig } from '#app';
import { ofetch } from 'ofetch';
import { useSessionStore } from '~/stores/session';

export default defineNuxtPlugin(async (nuxtApp) => {
  if (!import.meta.server) return;
  const event = nuxtApp.ssrContext?.event;
  if (!event) {
    return;
  }

  const session = useSessionStore();
  const config = useRuntimeConfig();

  const cookieHeader = event.node?.req?.headers?.cookie ?? '';
  const authHeader = event.node?.req?.headers?.authorization ?? '';

  if (!cookieHeader && !authHeader) {
    session.initialised = true;
    return;
  }

  try {
    const headers = new Headers();
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }
    if (authHeader) {
      headers.set('authorization', authHeader);
    }

    const response = await ofetch<{
      token: string;
      user: any;
      exp?: string | number | null;
      expiresAt?: string | null;
    }>('/api/auth/session', {
      baseURL: config.astralApiBase,
      credentials: 'include',
      headers,
    });

    if (response?.token && response?.user) {
      session.setSession({
        token: response.token,
        user: response.user,
        exp: response.exp != null ? String(response.exp) : null,
        expiresAt: response.expiresAt ?? null,
      });
      return;
    }
  } catch (error) {
    if (import.meta.dev) {
      // eslint-disable-next-line no-console
      console.warn('[session] Server session lookup failed', error);
    }
  }

  session.markUnauthenticated();
  session.initialised = true;
});
