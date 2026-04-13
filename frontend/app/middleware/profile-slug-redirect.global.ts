import { appendHeader, setResponseStatus } from 'h3';
import { defineNuxtRouteMiddleware, navigateTo, useRequestEvent } from '#app';

import { getRequestFetch } from '~/modules/api';

const normalizeSlug = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed;
};

const extractCrewSlug = (raw: unknown): string | null => {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? normalizeSlug(first) : null;
  }
  if (typeof raw === 'string') {
    return normalizeSlug(raw);
  }
  return null;
};

const buildProfilePath = (slug: string) => `/gangway/crew-quarters/${slug}`;

export default defineNuxtRouteMiddleware(async (to) => {
  const slug = extractCrewSlug(to.params?.slug);
  if (!slug) return;

  let response: { profile: unknown; redirectTo?: { profileSlug?: string } | null } | null = null;
  try {
    response = await getRequestFetch()<
      { profile: unknown; redirectTo?: { profileSlug?: string } | null }
    >(`/api/profiles/${slug}`);
  } catch (error: any) {
    const statusCode =
      Number.parseInt(
        String(error?.statusCode ?? error?.status ?? error?.response?.status ?? ''),
        10,
      ) || null;
    if (statusCode === 404) {
      // Static crew-quarters subroutes (for example `/gangway/crew-quarters/enlist`)
      // can reach this middleware when path parsing is overly broad. Ignore missing
      // profile slugs so navigation still succeeds.
      return;
    }
    if (import.meta.dev) {
      // eslint-disable-next-line no-console
      console.warn('[profile-slug-redirect] skipping canonical check after profile lookup failed', {
        slug,
        statusCode,
        error,
      });
    }
    return;
  }

  const canonicalSlug = response?.redirectTo?.profileSlug?.trim().toLowerCase() || null;
  if (!canonicalSlug) return;

  const canonicalPath = buildProfilePath(canonicalSlug);
  if (canonicalPath === to.path) return;

  if (import.meta.server) {
    const event = useRequestEvent();
    if (event) {
      appendHeader(event, 'Location', canonicalPath);
      setResponseStatus(event, 308);
      return navigateTo(
        {
          path: canonicalPath,
          query: to.query,
          hash: to.hash || undefined,
        },
        { replace: true, redirectCode: 308 },
      );
    }
  }

  return navigateTo(
    {
      path: canonicalPath,
      query: to.query,
      hash: to.hash || undefined,
    },
    { replace: true, redirectCode: 308 },
  );
});
