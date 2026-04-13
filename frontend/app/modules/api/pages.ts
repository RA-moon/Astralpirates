import { useSessionStore } from '~/stores/session';
import { getRequestFetch } from './index';
import { parsePositiveInt } from './numbers';
import {
  PageDocumentSchema,
  type PageBlock,
  type PageDocument,
} from '@astralpirates/shared/api-contracts';
import {
  sanitizeNavigationOverrides,
  sanitizePageBlocks,
} from '@astralpirates/shared/pageBlocks';
import {
  normalizeGalleryUploadResponse,
  type GalleryUploadResponse,
} from '~/modules/media/galleryUploadResponse';
import { getOrCreateEditorSessionId, randomToken } from '~/modules/editor/session';
import {
  asStatusCode,
  extractGalleryServerErrorMessage,
  isGalleryUploadTimeoutError,
  resolveGalleryUploadTimeoutMessage,
} from '~/modules/media/galleryRequestErrors';

type PageEditorRules = PageDocument['editor'];
type PageEditorUpdateRules = {
  minRole?: string | null;
  allowedRoles?: string[];
  allowedUsers?: Array<string | number>;
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through to JSON cloning
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const nullableString = (value: unknown): string | null => {
  const result = trim(value);
  return result.length > 0 ? result : null;
};

const normaliseEditorIdentifier = (value: unknown): string | number | null => {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normaliseEditorIdentifier((value as Record<string, unknown>).id);
  }
  return null;
};

const normaliseEditorRules = (
  rules: PageEditorRules | null | undefined,
): PageEditorUpdateRules | undefined => {
  if (!rules || typeof rules !== 'object') return undefined;

  const minRole = nullableString(rules.minRole);

  const allowedRoleSet = new Set<string>();
  if (Array.isArray(rules.allowedRoles)) {
    for (const role of rules.allowedRoles) {
      if (typeof role !== 'string') continue;
      const trimmed = role.trim();
      if (trimmed.length > 0) {
        allowedRoleSet.add(trimmed);
      }
    }
  }
  const allowedRoles = Array.from(allowedRoleSet);

  const allowedUserSet = new Set<string | number>();
  if (Array.isArray(rules.allowedUsers)) {
    for (const value of rules.allowedUsers) {
      const identifier = normaliseEditorIdentifier(value);
      if (identifier != null) {
        allowedUserSet.add(identifier);
      }
    }
  }
  const allowedUsers = Array.from(allowedUserSet);

  if (!minRole && allowedRoles.length === 0 && allowedUsers.length === 0) {
    return undefined;
  }

  const payload: PageEditorUpdateRules = {};
  if (minRole) payload.minRole = minRole;
  if (allowedRoles.length > 0) payload.allowedRoles = allowedRoles;
  if (allowedUsers.length > 0) payload.allowedUsers = allowedUsers;
  return payload;
};

export type PageUpdatePayload = {
  title: string;
  path: string;
  summary?: string | null;
  navigation?: NonNullable<PageDocument['navigation']>;
  layout: PageBlock[];
  editor?: PageEditorUpdateRules;
};

const normaliseErrorMessage = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const messageKeys = ['message', 'title', 'error', 'description'];
  for (const key of messageKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
};

const extractResponseError = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (Array.isArray(record.errors)) {
    const messages = record.errors
      .map((entry) => normaliseErrorMessage(entry))
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) {
      return messages.join('\n');
    }
  }

  if ('doc' in record) {
    return null;
  }

  const fallbackKeys = ['error', 'message', 'statusMessage'];
  for (const key of fallbackKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
};

const GALLERY_UPLOAD_REQUEST_TIMEOUT_MS = 45_000;

const normaliseToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const loadPageRevision = async ({
  requestFetch,
  pageId,
  token,
}: {
  requestFetch: ReturnType<typeof getRequestFetch>;
  pageId: string | number;
  token: string;
}): Promise<number> => {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const response = await requestFetch(`/api/pages/${pageId}`, {
    method: 'GET',
    params: { depth: 0 },
    headers,
  });

  const revision =
    parsePositiveInt((response as { revision?: unknown })?.revision) ??
    parsePositiveInt((response as { doc?: { revision?: unknown } })?.doc?.revision);

  if (!revision) {
    throw new Error('Unable to resolve page revision for this save.');
  }
  return revision;
};

const refreshSessionToken = async (
  session: ReturnType<typeof useSessionStore>,
): Promise<string | null> => {
  try {
    const refreshed = await session.refresh();
    return normaliseToken(refreshed?.token ?? session.bearerToken ?? null);
  } catch {
    return null;
  }
};

const resolvePageMutationToken = async (
  session: ReturnType<typeof useSessionStore>,
): Promise<string> => {
  const directToken = normaliseToken(session.bearerToken);
  if (directToken) return directToken;

  const refreshedToken = await refreshSessionToken(session);
  if (refreshedToken) return refreshedToken;

  session.clearSession();
  throw new Error('Session expired. Sign in again.');
};

export const preparePageUpdatePayload = (page: PageDocument): PageUpdatePayload => {
  const copy = clone(page);
  const navigation = sanitizeNavigationOverrides(copy.navigation ?? null);
  const layout = sanitizePageBlocks(copy.layout ?? []);
  const summary = nullableString(copy.summary);
  const editor = normaliseEditorRules(copy.editor ?? null);

  const payload: PageUpdatePayload = {
    title: trim(copy.title),
    path: trim(copy.path),
    summary: summary ?? null,
    // Payload group fields expect an object shape; passing null can trigger beforeValidate crashes.
    navigation: navigation ?? {},
    layout,
  };
  if (editor) {
    payload.editor = editor;
  }

  return payload;
};

export const updatePageDocument = async (
  pageId: string | number,
  payload: PageUpdatePayload,
): Promise<PageDocument> => {
  const requestFetch = getRequestFetch();
  const session = useSessionStore();
  const editorSessionId = getOrCreateEditorSessionId();
  const idempotencyKey = `page-write:${randomToken()}`;
  const mutate = (token: string | null | undefined) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    headers['x-idempotency-key'] = idempotencyKey;
    headers['x-editor-session-id'] = editorSessionId;
    return loadPageRevision({
      requestFetch,
      pageId,
      token: token ?? '',
    }).then((baseRevision) =>
      requestFetch(`/api/pages/${pageId}`, {
        method: 'PATCH',
        body: {
          ...payload,
          baseRevision,
          sessionId: editorSessionId,
        },
        headers,
        params: { depth: 1 },
      }),
    );
  };

  let response: unknown;
  const initialToken = await resolvePageMutationToken(session);
  try {
    response = await mutate(initialToken);
  } catch (error) {
    if (asStatusCode(error) === 401) {
      const refreshedToken = await refreshSessionToken(session);
      if (refreshedToken) {
        try {
          response = await mutate(refreshedToken);
        } catch (retryError) {
          if (asStatusCode(retryError) === 401) {
            session.clearSession();
            throw new Error('Session expired. Sign in again.');
          }
          throw retryError;
        }
      } else {
        session.clearSession();
        throw new Error('Session expired. Sign in again.');
      }
    } else {
      throw error;
    }
  }

  try {
    const responseError = extractResponseError(response);
    if (responseError) {
      const rejection = new Error(responseError);
      (rejection as Error & { data?: unknown }).data = response;
      throw rejection;
    }

    const envelope =
      response && typeof response === 'object'
        ? (response as { doc?: unknown; revision?: unknown; etag?: unknown })
        : null;
    const document = envelope?.doc ?? response;

    if (!document || typeof document !== 'object') {
      throw new Error('Page update response did not include a document payload');
    }

    const normalizedDocument = { ...(document as Record<string, unknown>) };
    if (envelope?.revision != null) {
      normalizedDocument.revision = envelope.revision;
    }
    if (typeof envelope?.etag === 'string') {
      normalizedDocument.etag = envelope.etag;
    }
    if (
      normalizedDocument.owner != null &&
      (typeof normalizedDocument.owner === 'string' || typeof normalizedDocument.owner === 'number')
    ) {
      normalizedDocument.owner = null;
    }

    return PageDocumentSchema.parse(normalizedDocument);
  } catch (error) {
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.error('[updatePageDocument] Failed to parse response', response, error);
    }
    throw error;
  }
};

export const uploadPageGalleryImage = async ({
  pageId,
  file,
}: {
  pageId: number;
  file: File;
}) => {
  const requestFetch = getRequestFetch();
  const session = useSessionStore();

  const upload = async (token: string | null | undefined) => {
    const formData = new FormData();
    formData.append('pageId', String(pageId));
    formData.append('file', file, file.name || 'page-gallery-upload.jpg');

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await requestFetch<GalleryUploadResponse>('/api/pages/gallery-images', {
      method: 'POST',
      body: formData,
      headers: Object.keys(headers).length ? headers : undefined,
      timeout: GALLERY_UPLOAD_REQUEST_TIMEOUT_MS,
    });
    const normalized = normalizeGalleryUploadResponse(response);
    if (!normalized?.asset || !normalized.imageUrl) {
      throw new Error('Upload failed.');
    }
    return normalized;
  };

  const initialToken = await resolvePageMutationToken(session);
  try {
    return await upload(initialToken);
  } catch (error: any) {
    if (isGalleryUploadTimeoutError(error)) {
      throw new Error(resolveGalleryUploadTimeoutMessage(GALLERY_UPLOAD_REQUEST_TIMEOUT_MS));
    }

    if (asStatusCode(error) === 401) {
      const refreshedToken = await refreshSessionToken(session);

      if (refreshedToken) {
        try {
          return await upload(refreshedToken);
        } catch (retryError: any) {
          if (isGalleryUploadTimeoutError(retryError)) {
            throw new Error(resolveGalleryUploadTimeoutMessage(GALLERY_UPLOAD_REQUEST_TIMEOUT_MS));
          }
          if (asStatusCode(retryError) === 401) {
            session.clearSession();
            throw new Error('Session expired. Sign in again.');
          }
          const retryMessage = extractGalleryServerErrorMessage(retryError);
          if (retryMessage) {
            throw new Error(retryMessage);
          }
          throw new Error('Upload failed. Try again.');
        }
      }

      session.clearSession();
      throw new Error('Session expired. Sign in again.');
    }
    const serverMessage = extractGalleryServerErrorMessage(error);
    if (serverMessage) {
      throw new Error(serverMessage);
    }
    throw new Error('Upload failed. Try again.');
  }
};

export const deletePageGalleryImage = async ({
  imageId,
  force = false,
}: {
  imageId: number;
  force?: boolean;
}): Promise<void> => {
  const requestFetch = getRequestFetch();
  const session = useSessionStore();

  const remove = async (token: string | null | undefined) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const forceSuffix = force ? '?force=true' : '';
    await requestFetch(`/api/pages/gallery-images/${encodeURIComponent(String(imageId))}${forceSuffix}`, {
      method: 'DELETE',
      headers: Object.keys(headers).length ? headers : undefined,
    });
  };

  const initialToken = await resolvePageMutationToken(session);
  try {
    await remove(initialToken);
  } catch (error: any) {
    if (asStatusCode(error) === 404) {
      return;
    }
    if (asStatusCode(error) === 401) {
      const refreshedToken = await refreshSessionToken(session);

      if (refreshedToken) {
        try {
          await remove(refreshedToken);
          return;
        } catch (retryError: any) {
          if (asStatusCode(retryError) === 404) {
            return;
          }
          if (asStatusCode(retryError) === 401) {
            session.clearSession();
            throw new Error('Session expired. Sign in again.');
          }
          const retryMessage = extractGalleryServerErrorMessage(retryError);
          if (retryMessage) {
            throw new Error(retryMessage);
          }
          throw new Error('Failed to remove media. Try again.');
        }
      }

      session.clearSession();
      throw new Error('Session expired. Sign in again.');
    }
    const serverMessage = extractGalleryServerErrorMessage(error);
    if (serverMessage) {
      throw new Error(serverMessage);
    }
    throw new Error('Failed to remove media. Try again.');
  }
};
