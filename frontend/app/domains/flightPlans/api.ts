import type { $Fetch } from 'ofetch';
import { getRequestFetch } from '~/modules/api';
import { useSessionStore } from '~/stores/session';
import type {
  FlightPlanLifecycleStatus,
  FlightPlanSummary,
  FlightPlanTask,
  FlightPlanTaskAttachment,
  FlightPlanTaskLink,
  FlightPlanTasksResponse,
} from '~/modules/api/schemas';
import {
  normalizeGalleryUploadResponse,
  type GalleryUploadPayload,
  type GalleryUploadResponse,
} from '~/modules/media/galleryUploadResponse';
import { getOrCreateEditorSessionId, randomToken } from '~/modules/editor/session';
import {
  asStatusCode,
  extractGalleryServerErrorMessage,
  isGalleryUploadTimeoutError,
  resolveGalleryUploadTimeoutMessage,
} from '~/modules/media/galleryRequestErrors';

export type FlightPlanMember = {
  id: number | null;
  flightPlanId: number | null;
  userId: number | null;
  role: string;
  status: string;
  invitedAt: string | null;
  respondedAt: string | null;
  user: {
    id: number | null;
    callSign: string | null;
    profileSlug: string | null;
    role: string | null;
  } | null;
  invitedBy: {
    id: number | null;
    callSign: string | null;
    profileSlug: string | null;
    role: string | null;
  } | null;
};

export type FlightPlanInvitee = {
  id: number | null;
  callSign: string | null;
  profileSlug: string | null;
  role: string | null;
};

const resolveAuthHeader = (rawAuthValue: string | null | undefined) => {
  const explicitToken = normaliseToken(rawAuthValue);
  if (explicitToken) return `Bearer ${explicitToken}`;

  return null;
};

export const normaliseFlightPlanSlug = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildFlightPlanEndpoint = (slug: string, suffix = '') =>
  `/api/flight-plans/${encodeURIComponent(slug)}${suffix}`;
const buildFlightPlanTaskEndpoint = (slug: string, taskId?: number | string) => {
  const base = buildFlightPlanEndpoint(slug, '/tasks');
  if (typeof taskId === 'number' || typeof taskId === 'string') {
    return `${base}/${encodeURIComponent(String(taskId))}`;
  }
  return base;
};

const withFetch = (rawAuthValue: string | null | undefined): $Fetch => {
  const fetcher = getRequestFetch();
  return ((request, options = {}) => {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    const authHeader = resolveAuthHeader(rawAuthValue);
    if (authHeader) {
      headers.set('Authorization', authHeader);
    }
    return fetcher(request, {
      ...options,
      headers,
    });
  }) as $Fetch;
};

const ensureSlug = (slug: string | null): string => {
  if (!slug) {
    throw new Error('Invalid flight plan slug.');
  }
  return slug;
};

const GALLERY_UPLOAD_REQUEST_TIMEOUT_MS = 45_000;

const handleUnauthorized = (): never => {
  try {
    const session = useSessionStore();
    session.clearSession();
  } catch {
    // Ignore store access failures outside active Nuxt context.
  }
  throw new Error('Session expired. Sign in again.');
};

const normaliseToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const refreshSessionToken = async (): Promise<string | null> => {
  try {
    const session = useSessionStore();
    const refreshed = await session.refresh();
    return normaliseToken(refreshed?.token ?? session.bearerToken ?? null);
  } catch {
    return null;
  }
};

const resolveUploadToken = async (
  rawAuthValue: string | null | undefined,
): Promise<string> => {
  const directToken = normaliseToken(rawAuthValue);
  if (directToken) return directToken;

  const refreshedToken = await refreshSessionToken();
  if (refreshedToken) return refreshedToken;
  return handleUnauthorized();
};

export const fetchFlightPlanMembers = async ({
  auth: rawAuthValue,
  slug,
}: {
  auth: string | null | undefined;
  slug: string;
}): Promise<FlightPlanMember[]> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ memberships: FlightPlanMember[] }>(
    buildFlightPlanEndpoint(normalisedSlug, '/members'),
    {
      method: 'GET',
    },
  );
  return Array.isArray(response.memberships) ? response.memberships : [];
};

export const inviteFlightPlanMember = async ({
  auth: rawAuthValue,
  slug,
  crewSlug,
}: {
  auth: string | null | undefined;
  slug: string;
  crewSlug: string;
}): Promise<FlightPlanMember> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ membership: FlightPlanMember }>(
    buildFlightPlanEndpoint(normalisedSlug, '/members'),
    {
      method: 'POST',
      body: { slug: crewSlug },
    },
  );
  if (!response?.membership) {
    throw new Error('Unable to create invite.');
  }
  return response.membership;
};

export const searchFlightPlanInvitees = async ({
  auth: rawAuthValue,
  slug,
  query,
}: {
  auth: string | null | undefined;
  slug: string;
  query: string;
}): Promise<FlightPlanInvitee[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ results: FlightPlanInvitee[] }>(
    buildFlightPlanEndpoint(normalisedSlug, '/invitees'),
    {
      method: 'GET',
      params: { q: trimmed },
    },
  );
  return Array.isArray(response.results) ? response.results : [];
};

export const promoteFlightPlanMember = async ({
  auth: rawAuthValue,
  slug,
  membershipId,
}: {
  auth: string | null | undefined;
  slug: string;
  membershipId: number;
}): Promise<FlightPlanMember> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ membership: FlightPlanMember }>(
    buildFlightPlanEndpoint(normalisedSlug, `/members/${membershipId}`),
    {
      method: 'PATCH',
      body: { action: 'promote', role: 'crew' },
    },
  );
  if (!response?.membership) {
    throw new Error('Unable to promote membership.');
  }
  return response.membership;
};

export const createFlightPlan = async <TResponse>({
  auth: rawAuthValue,
  payload,
}: {
  auth: string | null | undefined;
  payload: Record<string, unknown>;
}): Promise<TResponse> => {
  const fetcher = withFetch(rawAuthValue);
  return fetcher<TResponse>('/api/flight-plans', {
    method: 'POST',
    body: payload,
  });
};

export const updateFlightPlan = async <TResponse>({
  auth: rawAuthValue,
  slug,
  payload,
  baseRevision,
  sessionId,
  idempotencyKey,
}: {
  auth: string | null | undefined;
  slug: string;
  payload: Record<string, unknown>;
  baseRevision?: number | null;
  sessionId?: string | null;
  idempotencyKey?: string | null;
}): Promise<TResponse> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const resolvedBaseRevision =
    typeof baseRevision === 'number' && Number.isFinite(baseRevision) && baseRevision > 0
      ? Math.trunc(baseRevision)
      : null;
  if (!resolvedBaseRevision) {
    throw new Error('Missing editor revision. Reload the mission and try again.');
  }
  const resolvedSessionId = normaliseToken(sessionId) ?? getOrCreateEditorSessionId();
  const resolvedIdempotencyKey = normaliseToken(idempotencyKey) ?? `flight-plan-write:${randomToken()}`;
  const mutationBody = {
    ...payload,
    baseRevision: resolvedBaseRevision,
    sessionId: resolvedSessionId,
  };
  const mutationHeaders = {
    'x-idempotency-key': resolvedIdempotencyKey,
    'x-editor-session-id': resolvedSessionId,
  };

  const fetcher = withFetch(rawAuthValue);
  try {
    return await fetcher<TResponse>(buildFlightPlanEndpoint(normalisedSlug), {
      method: 'PATCH',
      body: mutationBody,
      headers: mutationHeaders,
    });
  } catch (initialError) {
    if (asStatusCode(initialError) === 401) {
      try {
        const session = useSessionStore();
        const refreshed = await session.refresh();
        const refreshedToken = refreshed?.token ?? session.bearerToken ?? null;
        if (typeof refreshedToken === 'string' && refreshedToken.trim().length > 0) {
          const retryFetcher = withFetch(refreshedToken);
          return await retryFetcher<TResponse>(buildFlightPlanEndpoint(normalisedSlug), {
            method: 'PATCH',
            body: mutationBody,
            headers: mutationHeaders,
          });
        }
      } catch {
        // Fall through to the shared unauthorized handler.
      }
      handleUnauthorized();
    }
    throw initialError;
  }
};

export const deleteFlightPlan = async ({
  auth: rawAuthValue,
  slug,
}: {
  auth: string | null | undefined;
  slug: string;
}): Promise<void> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  await fetcher(buildFlightPlanEndpoint(normalisedSlug), {
    method: 'DELETE',
  });
};

export const transitionFlightPlanStatus = async ({
  auth: rawAuthValue,
  slug,
  status,
  statusReason,
}: {
  auth: string | null | undefined;
  slug: string;
  status: FlightPlanLifecycleStatus;
  statusReason?: string | null;
}): Promise<FlightPlanSummary> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ plan: FlightPlanSummary }>(
    buildFlightPlanEndpoint(normalisedSlug, '/status'),
    {
      method: 'POST',
      body: {
        status,
        statusReason: statusReason ?? null,
      },
    },
  );
  if (!response?.plan) {
    throw new Error('Unable to update mission lifecycle status.');
  }
  return response.plan;
};

export const reopenFlightPlan = async ({
  auth: rawAuthValue,
  slug,
  statusReason,
}: {
  auth: string | null | undefined;
  slug: string;
  statusReason: string;
}): Promise<FlightPlanSummary> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ plan: FlightPlanSummary }>(
    buildFlightPlanEndpoint(normalisedSlug, '/reopen'),
    {
      method: 'POST',
      body: {
        statusReason,
      },
    },
  );
  if (!response?.plan) {
    throw new Error('Unable to reopen mission lifecycle status.');
  }
  return response.plan;
};

export const createFlightPlanIteration = async ({
  auth: rawAuthValue,
  slug,
  payload,
}: {
  auth: string | null | undefined;
  slug: string;
  payload: {
    title?: string;
    summary?: string;
    location?: string;
    eventDate?: string;
    displayDate?: string;
    body?: unknown;
  };
}): Promise<FlightPlanSummary> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ plan: FlightPlanSummary }>(
    buildFlightPlanEndpoint(normalisedSlug, '/iterations'),
    {
      method: 'POST',
      body: payload,
    },
  );
  if (!response?.plan) {
    throw new Error('Unable to create next mission iteration.');
  }
  return response.plan;
};

export const uploadFlightPlanGalleryImage = async ({
  auth: rawAuthValue,
  flightPlanId,
  file,
}: {
  auth: string | null | undefined;
  flightPlanId: number;
  file: File;
}): Promise<GalleryUploadPayload> => {
  const upload = async (authValue: string | null | undefined) => {
    const fetcher = withFetch(authValue);
    const formData = new FormData();
    formData.append('flightPlanId', String(flightPlanId));
    formData.append('file', file, file.name || 'gallery-upload.jpg');

    const response = await fetcher<GalleryUploadResponse>('/api/flight-plans/gallery-images', {
      method: 'POST',
      body: formData,
      timeout: GALLERY_UPLOAD_REQUEST_TIMEOUT_MS,
    });
    const normalized = normalizeGalleryUploadResponse(response);
    if (!normalized?.asset || !normalized.imageUrl) {
      throw new Error('Upload failed.');
    }
    return normalized;
  };

  const initialToken = await resolveUploadToken(rawAuthValue);

  try {
    return await upload(initialToken);
  } catch (error: any) {
    if (isGalleryUploadTimeoutError(error)) {
      throw new Error(resolveGalleryUploadTimeoutMessage(GALLERY_UPLOAD_REQUEST_TIMEOUT_MS));
    }

    if (asStatusCode(error) === 401) {
      const refreshedToken = await refreshSessionToken();

      if (refreshedToken) {
        try {
          return await upload(refreshedToken);
        } catch (retryError: any) {
          if (isGalleryUploadTimeoutError(retryError)) {
            throw new Error(resolveGalleryUploadTimeoutMessage(GALLERY_UPLOAD_REQUEST_TIMEOUT_MS));
          }
          if (asStatusCode(retryError) === 401) {
            handleUnauthorized();
          }
          const retryMessage = extractGalleryServerErrorMessage(retryError);
          if (retryMessage) {
            throw new Error(retryMessage);
          }
          throw new Error('Upload failed. Try again.');
        }
      }

      handleUnauthorized();
    }
    const serverMessage = extractGalleryServerErrorMessage(error);
    if (serverMessage) {
      throw new Error(serverMessage);
    }
    throw new Error('Upload failed. Try again.');
  }
};

export const deleteFlightPlanGalleryImage = async ({
  auth: rawAuthValue,
  imageId,
  force = false,
}: {
  auth: string | null | undefined;
  imageId: number;
  force?: boolean;
}): Promise<void> => {
  const remove = async (authValue: string | null | undefined) => {
    const fetcher = withFetch(authValue);
    const forceSuffix = force ? '?force=true' : '';
    await fetcher(`/api/flight-plans/gallery-images/${imageId}${forceSuffix}`, {
      method: 'DELETE',
    });
  };

  const initialToken = await resolveUploadToken(rawAuthValue);

  try {
    await remove(initialToken);
  } catch (error: any) {
    if (asStatusCode(error) === 404) {
      return;
    }
    if (asStatusCode(error) === 401) {
      const refreshedToken = await refreshSessionToken();

      if (refreshedToken) {
        try {
          await remove(refreshedToken);
          return;
        } catch (retryError: any) {
          if (asStatusCode(retryError) === 404) {
            return;
          }
          if (asStatusCode(retryError) === 401) {
            handleUnauthorized();
          }
          const retryMessage = extractGalleryServerErrorMessage(retryError);
          if (retryMessage) {
            throw new Error(retryMessage);
          }
          throw new Error('Failed to remove media. Try again.');
        }
      }

      handleUnauthorized();
    }
    const serverMessage = extractGalleryServerErrorMessage(error);
    if (serverMessage) {
      throw new Error(serverMessage);
    }
    throw new Error('Failed to remove media. Try again.');
  }
};

export const fetchFlightPlanTasks = async ({
  auth: rawAuthValue,
  slug,
}: {
  auth: string | null | undefined;
  slug: string;
}): Promise<FlightPlanTasksResponse> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<FlightPlanTasksResponse>(
    buildFlightPlanTaskEndpoint(normalisedSlug),
    {
      method: 'GET',
    },
  );
  return {
    tasks: Array.isArray(response.tasks) ? response.tasks : [],
    total:
      typeof response.total === 'number'
        ? response.total
        : Array.isArray(response.tasks)
          ? response.tasks.length
          : 0,
    etag: typeof response.etag === 'string' ? response.etag : undefined,
  };
};

type TaskPayload = Partial<Pick<FlightPlanTask, 'title' | 'state' | 'assigneeMembershipIds'>> & {
  description?: unknown;
  action?: 'claim' | 'unclaim';
};

export const createFlightPlanTask = async ({
  auth: rawAuthValue,
  slug,
  payload,
}: {
  auth: string | null | undefined;
  slug: string;
  payload: TaskPayload & { title: string };
}): Promise<FlightPlanTask> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ task: FlightPlanTask }>(
    buildFlightPlanTaskEndpoint(normalisedSlug),
    {
      method: 'POST',
      body: payload,
    },
  );
  if (!response?.task) {
    throw new Error('Unable to create mission task.');
  }
  return response.task;
};

export const updateFlightPlanTask = async ({
  auth: rawAuthValue,
  slug,
  taskId,
  payload,
}: {
  auth: string | null | undefined;
  slug: string;
  taskId: number;
  payload: TaskPayload & { ownerMembershipId?: number; listOrder?: number };
}): Promise<FlightPlanTask> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ task: FlightPlanTask }>(
    buildFlightPlanTaskEndpoint(normalisedSlug, taskId),
    {
      method: 'PATCH',
      body: payload,
    },
  );
  if (!response?.task) {
    throw new Error('Unable to update mission task.');
  }
  return response.task;
};

export const deleteFlightPlanTask = async ({
  auth: rawAuthValue,
  slug,
  taskId,
}: {
  auth: string | null | undefined;
  slug: string;
  taskId: number;
}): Promise<void> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  await fetcher(buildFlightPlanTaskEndpoint(normalisedSlug, taskId), {
    method: 'DELETE',
  });
};

export const uploadFlightPlanTaskAttachment = async ({
  auth: rawAuthValue,
  slug,
  taskId,
  file,
}: {
  auth: string | null | undefined;
  slug: string;
  taskId: number;
  file: File;
}): Promise<{ attachment: FlightPlanTaskAttachment; task?: FlightPlanTask }> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const formData = new FormData();
  formData.append('file', file, file.name || 'attachment.dat');
  const response = await fetcher<{ attachment: FlightPlanTaskAttachment; task?: FlightPlanTask }>(
    `${buildFlightPlanTaskEndpoint(normalisedSlug, taskId)}/attachments`,
    {
      method: 'POST',
      body: formData,
    },
  );
  if (!response?.attachment) {
    throw new Error('Unable to upload attachment.');
  }
  return response;
};

export const deleteFlightPlanTaskAttachment = async ({
  auth: rawAuthValue,
  slug,
  taskId,
  attachmentId,
}: {
  auth: string | null | undefined;
  slug: string;
  taskId: number;
  attachmentId: string;
}): Promise<FlightPlanTask | null> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ task?: FlightPlanTask }>(
    `${buildFlightPlanTaskEndpoint(normalisedSlug, taskId)}/attachments`,
    {
      method: 'DELETE',
      params: { attachmentId },
    },
  );
  return response?.task ?? null;
};

export const addFlightPlanTaskLink = async ({
  auth: rawAuthValue,
  slug,
  taskId,
  payload,
}: {
  auth: string | null | undefined;
  slug: string;
  taskId: number;
  payload: { url: string; title?: string };
}): Promise<{ link: FlightPlanTaskLink; task?: FlightPlanTask }> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ link: FlightPlanTaskLink; task?: FlightPlanTask }>(
    `${buildFlightPlanTaskEndpoint(normalisedSlug, taskId)}/links`,
    {
      method: 'POST',
      body: payload,
    },
  );
  if (!response?.link) {
    throw new Error('Unable to save link.');
  }
  return response;
};

export const deleteFlightPlanTaskLink = async ({
  auth: rawAuthValue,
  slug,
  taskId,
  linkId,
}: {
  auth: string | null | undefined;
  slug: string;
  taskId: number;
  linkId: string;
}): Promise<FlightPlanTask | null> => {
  const normalisedSlug = ensureSlug(normaliseFlightPlanSlug(slug));
  const fetcher = withFetch(rawAuthValue);
  const response = await fetcher<{ task?: FlightPlanTask }>(
    `${buildFlightPlanTaskEndpoint(normalisedSlug, taskId)}/links`,
    {
      method: 'DELETE',
      params: { linkId },
    },
  );
  return response?.task ?? null;
};
