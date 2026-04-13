import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  acquireEditorDocumentLock,
} from '@/app/api/_lib/editorWrites';
import { recordEditorLockAcquire } from '@/app/api/_lib/editorWriteMetrics';
import {
  ensureEditorLockEditAccess,
  parseEditorLockRequest,
} from '@/app/api/editor-locks/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,POST';

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function POST(req: NextRequest) {
  const parsed = await parseEditorLockRequest(req);
  if (!parsed.ok) {
    return corsJson(req, { error: parsed.error }, { status: parsed.status }, METHODS);
  }

  const {
    auth,
    userId,
    documentType,
    documentId,
    sessionId,
    leaseSeconds,
    lockMode,
  } = parsed.value;

  const accessCheck = await ensureEditorLockEditAccess({
    req,
    methods: METHODS,
    context: parsed.value,
  });
  if (!accessCheck.ok) {
    return accessCheck.response;
  }

  const result = await acquireEditorDocumentLock({
    payload: auth.payload,
    documentType,
    documentId,
    holderUserId: userId,
    holderSessionId: sessionId,
    lockMode,
    leaseSeconds,
  });

  if (result.status === 'locked') {
    recordEditorLockAcquire(auth.payload.logger ?? console, documentType, 'blocked');
    auth.payload.logger?.warn?.(
      {
        event: 'editor_lock_acquire_blocked',
        documentType,
        documentId,
        lockMode,
        requestSessionId: sessionId,
        holderUserId: result.lock.holderUserId,
        holderSessionId: result.lock.holderSessionId,
        expiresAt: result.lock.expiresAt,
      },
      '[editor-lock] acquire blocked by active lock',
    );
    return corsJson(
      req,
      {
        error: 'Document is currently locked by another editor session.',
        code: 'editor_locked',
        lock: result.lock,
      },
      { status: 423 },
      METHODS,
    );
  }

  recordEditorLockAcquire(auth.payload.logger ?? console, documentType, 'acquired');
  auth.payload.logger?.info?.(
    {
      event: 'editor_lock_acquire',
      documentType,
      documentId,
      lockMode,
      requestSessionId: sessionId,
      reacquired: result.reacquired,
      tookExpiredLock: result.tookExpiredLock,
      expiresAt: result.lock.expiresAt,
    },
    '[editor-lock] acquire success',
  );

  return corsJson(
    req,
    {
      acquired: true,
      reacquired: result.reacquired,
      tookExpiredLock: result.tookExpiredLock,
      lock: result.lock,
    },
    {},
    METHODS,
  );
}
