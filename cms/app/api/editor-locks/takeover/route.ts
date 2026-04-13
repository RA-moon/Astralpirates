import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  takeoverEditorDocumentLock,
} from '@/app/api/_lib/editorWrites';
import { recordEditorLockTakeover } from '@/app/api/_lib/editorWriteMetrics';
import {
  ensureEditorLockEditAccess,
  parseEditorLockRequest,
  parseTakeoverReason,
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
    body,
    documentType,
    documentId,
    sessionId,
    leaseSeconds,
  } = parsed.value;

  const reason = parseTakeoverReason(body);
  if (!reason) {
    return corsJson(req, { error: 'Takeover reason is required.' }, { status: 400 }, METHODS);
  }

  const accessCheck = await ensureEditorLockEditAccess({
    req,
    methods: METHODS,
    context: parsed.value,
  });
  if (!accessCheck.ok) {
    return accessCheck.response;
  }

  const result = await takeoverEditorDocumentLock({
    payload: auth.payload,
    documentType,
    documentId,
    holderUserId: userId,
    holderSessionId: sessionId,
    reason,
    leaseSeconds,
  });

  if (result.status === 'not_found') {
    recordEditorLockTakeover(auth.payload.logger ?? console, documentType, 'not_found');
    auth.payload.logger?.warn?.(
      {
        event: 'editor_lock_takeover_not_found',
        documentType,
        documentId,
        requestSessionId: sessionId,
      },
      '[editor-lock] takeover requested without active lock',
    );
    return corsJson(req, { error: 'Active lock not found.' }, { status: 404 }, METHODS);
  }

  if (result.status === 'not_expired') {
    recordEditorLockTakeover(auth.payload.logger ?? console, documentType, 'blocked');
    auth.payload.logger?.warn?.(
      {
        event: 'editor_lock_takeover_blocked',
        documentType,
        documentId,
        requestSessionId: sessionId,
        holderUserId: result.lock.holderUserId,
        holderSessionId: result.lock.holderSessionId,
        expiresAt: result.lock.expiresAt,
      },
      '[editor-lock] takeover blocked because lock is still active',
    );
    return corsJson(
      req,
      {
        error: 'Lock takeover is allowed only after lock expiry.',
        code: 'lock_not_expired',
        lock: result.lock,
      },
      { status: 409 },
      METHODS,
    );
  }

  recordEditorLockTakeover(auth.payload.logger ?? console, documentType, 'taken_over');
  auth.payload.logger?.info?.(
    {
      event: 'editor_lock_takeover',
      documentType,
      documentId,
      requestSessionId: sessionId,
      reason,
      holderUserId: result.lock.holderUserId,
      holderSessionId: result.lock.holderSessionId,
      expiresAt: result.lock.expiresAt,
    },
    '[editor-lock] takeover success',
  );

  return corsJson(req, { takeover: true, lock: result.lock }, {}, METHODS);
}
