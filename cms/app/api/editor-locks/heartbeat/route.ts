import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  heartbeatEditorDocumentLock,
} from '@/app/api/_lib/editorWrites';
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
  } = parsed.value;

  const accessCheck = await ensureEditorLockEditAccess({
    req,
    methods: METHODS,
    context: parsed.value,
  });
  if (!accessCheck.ok) {
    return accessCheck.response;
  }

  const lock = await heartbeatEditorDocumentLock({
    payload: auth.payload,
    documentType,
    documentId,
    holderUserId: userId,
    holderSessionId: sessionId,
    leaseSeconds,
  });

  if (!lock) {
    auth.payload.logger?.warn?.(
      {
        event: 'editor_lock_heartbeat_missing',
        documentType,
        documentId,
        requestSessionId: sessionId,
      },
      '[editor-lock] heartbeat without active lock',
    );
    return corsJson(
      req,
      {
        error: 'Active lock not found for this session.',
        code: 'lock_not_held',
      },
      { status: 409 },
      METHODS,
    );
  }

  return corsJson(req, { heartbeat: true, lock }, {}, METHODS);
}
