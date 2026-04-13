import { getRequestFetch } from '~/modules/api';
import { parsePositiveInt } from '~/modules/api/numbers';
import { asStatusCode } from '~/modules/media/galleryRequestErrors';

export type EditorDocumentType = 'flight-plan' | 'page';
export type EditorLockMode = 'soft' | 'hard';

export type EditorDocumentLock = {
  documentType: EditorDocumentType;
  documentId: number;
  lockMode: EditorLockMode;
  holderUserId: number;
  holderSessionId: string;
  acquiredAt: string;
  expiresAt: string;
  lastHeartbeatAt: string;
  takeoverReason: string | null;
};

export type EditorLockAcquireResult =
  | {
      status: 'acquired';
      lock: EditorDocumentLock;
      reacquired: boolean;
      tookExpiredLock: boolean;
    }
  | {
      status: 'locked';
      lock: EditorDocumentLock;
      error: string;
    };

export type EditorLockHeartbeatResult =
  | {
      status: 'ok';
      lock: EditorDocumentLock;
    }
  | {
      status: 'missing';
      error: string;
    };

export type EditorLockTakeoverResult =
  | {
      status: 'taken_over';
      lock: EditorDocumentLock;
    }
  | {
      status: 'not_found';
      error: string;
    }
  | {
      status: 'not_expired';
      lock: EditorDocumentLock;
      error: string;
    };

const parseTrimmed = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toIsoString = (value: unknown): string | null => {
  const parsed = parseTrimmed(value);
  if (!parsed) return null;
  const ts = Date.parse(parsed);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
};

const parseErrorMessage = (value: unknown): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return 'Unable to complete editor lock request.';
};

const parseErrorCode = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const code = (value as Record<string, unknown>).code;
  return parseTrimmed(code);
};

const parseDataMessage = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const keys = ['error', 'message', 'statusMessage'];
  for (const key of keys) {
    const candidate = parseTrimmed(record[key]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
};

export const parseEditorDocumentLock = (value: unknown): EditorDocumentLock | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const documentType = parseTrimmed(record.documentType);
  const lockMode = parseTrimmed(record.lockMode);
  const documentId = parsePositiveInt(record.documentId);
  const holderUserId = parsePositiveInt(record.holderUserId);
  const holderSessionId = parseTrimmed(record.holderSessionId);
  const acquiredAt = toIsoString(record.acquiredAt);
  const expiresAt = toIsoString(record.expiresAt);
  const lastHeartbeatAt = toIsoString(record.lastHeartbeatAt);

  if (
    !documentType ||
    (documentType !== 'flight-plan' && documentType !== 'page') ||
    !lockMode ||
    (lockMode !== 'soft' && lockMode !== 'hard') ||
    !documentId ||
    !holderUserId ||
    !holderSessionId ||
    !acquiredAt ||
    !expiresAt ||
    !lastHeartbeatAt
  ) {
    return null;
  }

  return {
    documentType,
    documentId,
    lockMode,
    holderUserId,
    holderSessionId,
    acquiredAt,
    expiresAt,
    lastHeartbeatAt,
    takeoverReason: parseTrimmed(record.takeoverReason),
  };
};

const buildHeaders = ({
  authToken,
  sessionId,
}: {
  authToken?: string | null;
  sessionId: string;
}): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-editor-session-id': sessionId,
  };
  const token = parseTrimmed(authToken);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const buildPayload = ({
  documentType,
  documentId,
  sessionId,
  lockMode,
  leaseSeconds,
}: {
  documentType: EditorDocumentType;
  documentId: number;
  sessionId: string;
  lockMode?: EditorLockMode;
  leaseSeconds?: number;
}) => {
  const payload: Record<string, unknown> = {
    documentType,
    documentId,
    sessionId,
  };
  if (lockMode) {
    payload.lockMode = lockMode;
  }
  if (typeof leaseSeconds === 'number' && Number.isFinite(leaseSeconds) && leaseSeconds > 0) {
    payload.leaseSeconds = Math.trunc(leaseSeconds);
  }
  return payload;
};

const parseAcquireSuccess = (response: unknown): EditorLockAcquireResult => {
  if (!response || typeof response !== 'object') {
    throw new Error('Lock acquire response was malformed.');
  }
  const record = response as Record<string, unknown>;
  const lock = parseEditorDocumentLock(record.lock);
  if (!lock) {
    throw new Error('Lock acquire response was missing lock details.');
  }
  return {
    status: 'acquired',
    lock,
    reacquired: Boolean(record.reacquired),
    tookExpiredLock: Boolean(record.tookExpiredLock),
  };
};

const parseHeartbeatSuccess = (response: unknown): EditorLockHeartbeatResult => {
  if (!response || typeof response !== 'object') {
    throw new Error('Lock heartbeat response was malformed.');
  }
  const record = response as Record<string, unknown>;
  const lock = parseEditorDocumentLock(record.lock);
  if (!lock) {
    throw new Error('Lock heartbeat response was missing lock details.');
  }
  return {
    status: 'ok',
    lock,
  };
};

const parseTakeoverSuccess = (response: unknown): EditorLockTakeoverResult => {
  if (!response || typeof response !== 'object') {
    throw new Error('Lock takeover response was malformed.');
  }
  const record = response as Record<string, unknown>;
  const lock = parseEditorDocumentLock(record.lock);
  if (!lock) {
    throw new Error('Lock takeover response was missing lock details.');
  }
  return {
    status: 'taken_over',
    lock,
  };
};

const resolveErrorPayload = (error: unknown): Record<string, unknown> | null => {
  if (!error || typeof error !== 'object') return null;
  const data = (error as Record<string, unknown>).data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
};

export const acquireEditorDocumentLock = async ({
  authToken,
  documentType,
  documentId,
  sessionId,
  lockMode = 'soft',
  leaseSeconds,
}: {
  authToken?: string | null;
  documentType: EditorDocumentType;
  documentId: number;
  sessionId: string;
  lockMode?: EditorLockMode;
  leaseSeconds?: number;
}): Promise<EditorLockAcquireResult> => {
  const requestFetch = getRequestFetch();
  const headers = buildHeaders({ authToken, sessionId });
  const body = buildPayload({ documentType, documentId, sessionId, lockMode, leaseSeconds });

  try {
    const response = await requestFetch('/api/editor-locks/acquire', {
      method: 'POST',
      headers,
      body,
    });
    return parseAcquireSuccess(response);
  } catch (error) {
    const statusCode = asStatusCode(error);
    const data = resolveErrorPayload(error);
    if (statusCode === 423) {
      const lock = parseEditorDocumentLock(data?.lock);
      if (lock) {
        return {
          status: 'locked',
          lock,
          error:
            parseDataMessage(data) ?? 'Document is currently locked by another editor session.',
        };
      }
    }
    throw error;
  }
};

export const heartbeatEditorDocumentLock = async ({
  authToken,
  documentType,
  documentId,
  sessionId,
  leaseSeconds,
}: {
  authToken?: string | null;
  documentType: EditorDocumentType;
  documentId: number;
  sessionId: string;
  leaseSeconds?: number;
}): Promise<EditorLockHeartbeatResult> => {
  const requestFetch = getRequestFetch();
  const headers = buildHeaders({ authToken, sessionId });
  const body = buildPayload({ documentType, documentId, sessionId, leaseSeconds });

  try {
    const response = await requestFetch('/api/editor-locks/heartbeat', {
      method: 'POST',
      headers,
      body,
    });
    return parseHeartbeatSuccess(response);
  } catch (error) {
    const statusCode = asStatusCode(error);
    const data = resolveErrorPayload(error);
    if (statusCode === 409 && parseErrorCode(data) === 'lock_not_held') {
      return {
        status: 'missing',
        error: parseDataMessage(data) ?? 'Active editor lock not found for this session.',
      };
    }
    throw error;
  }
};

export const releaseEditorDocumentLock = async ({
  authToken,
  documentType,
  documentId,
  sessionId,
}: {
  authToken?: string | null;
  documentType: EditorDocumentType;
  documentId: number;
  sessionId: string;
}): Promise<boolean> => {
  const requestFetch = getRequestFetch();
  const headers = buildHeaders({ authToken, sessionId });
  const body = buildPayload({ documentType, documentId, sessionId });

  try {
    await requestFetch('/api/editor-locks/release', {
      method: 'POST',
      headers,
      body,
    });
    return true;
  } catch (error) {
    const statusCode = asStatusCode(error);
    const data = resolveErrorPayload(error);
    if (statusCode === 409 && parseErrorCode(data) === 'lock_not_held') {
      return false;
    }
    throw error;
  }
};

export const takeoverEditorDocumentLock = async ({
  authToken,
  documentType,
  documentId,
  sessionId,
  reason,
  leaseSeconds,
}: {
  authToken?: string | null;
  documentType: EditorDocumentType;
  documentId: number;
  sessionId: string;
  reason: string;
  leaseSeconds?: number;
}): Promise<EditorLockTakeoverResult> => {
  const requestFetch = getRequestFetch();
  const headers = buildHeaders({ authToken, sessionId });
  const body: Record<string, unknown> = {
    ...buildPayload({ documentType, documentId, sessionId, leaseSeconds }),
    reason,
  };

  try {
    const response = await requestFetch('/api/editor-locks/takeover', {
      method: 'POST',
      headers,
      body,
    });
    return parseTakeoverSuccess(response);
  } catch (error) {
    const statusCode = asStatusCode(error);
    const data = resolveErrorPayload(error);

    if (statusCode === 404) {
      return {
        status: 'not_found',
        error: parseDataMessage(data) ?? 'Active lock not found.',
      };
    }

    if (statusCode === 409 && parseErrorCode(data) === 'lock_not_expired') {
      const lock = parseEditorDocumentLock(data?.lock);
      if (lock) {
        return {
          status: 'not_expired',
          lock,
          error: parseDataMessage(data) ?? 'Lock takeover is allowed only after lock expiry.',
        };
      }
      return {
        status: 'not_found',
        error: parseDataMessage(data) ?? 'Lock takeover is not available yet.',
      };
    }

    throw error;
  }
};

export const extractEditorWriteErrorMessage = (error: unknown, fallback: string): string => {
  const data = resolveErrorPayload(error);
  return parseDataMessage(data) ?? parseErrorMessage((error as { message?: unknown })?.message) ?? fallback;
};

export const extractEditorWriteErrorCode = (error: unknown): string | null => {
  return parseErrorCode(resolveErrorPayload(error));
};

export const extractEditorWriteLock = (error: unknown): EditorDocumentLock | null => {
  const data = resolveErrorPayload(error);
  return parseEditorDocumentLock(data?.lock);
};
