import type { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  releaseEditorDocumentLock,
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
  } = parsed.value;

  const accessCheck = await ensureEditorLockEditAccess({
    req,
    methods: METHODS,
    context: parsed.value,
  });
  if (!accessCheck.ok) {
    return accessCheck.response;
  }

  const released = await releaseEditorDocumentLock({
    payload: auth.payload,
    documentType,
    documentId,
    holderUserId: userId,
    holderSessionId: sessionId,
  });

  if (!released) {
    auth.payload.logger?.warn?.(
      {
        event: 'editor_lock_release_missing',
        documentType,
        documentId,
        requestSessionId: sessionId,
      },
      '[editor-lock] release requested without active lock',
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

  auth.payload.logger?.info?.(
    {
      event: 'editor_lock_release',
      documentType,
      documentId,
      requestSessionId: sessionId,
    },
    '[editor-lock] release success',
  );

  return corsJson(req, { released: true }, {}, METHODS);
}
