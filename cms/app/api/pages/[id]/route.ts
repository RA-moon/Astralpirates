import type { NextRequest } from 'next/server';

import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  beginEditorWriteIdempotency,
  buildEditorDocumentEtag,
  bumpEditorDocumentRevision,
  completeEditorWriteIdempotency,
  ensureEditorDocumentRevision,
  hashEditorLogToken,
  hashEditorMutationPayload,
  loadEditorDocumentLock,
  resolveEditorBaseRevision,
  sanitiseEditorIdempotencyKey,
  sanitiseEditorSessionId,
} from '@/app/api/_lib/editorWrites';
import {
  recordEditorIdempotencyReplay,
  recordEditorWriteAttempt,
  recordEditorWriteCommit,
  recordEditorWriteConflict,
} from '@/app/api/_lib/editorWriteMetrics';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';
import { resolvePageEditAccess } from '@/app/api/_lib/pageEditorAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET,PATCH';

type RouteParams = { params: Promise<{ id?: string }> };

const parsePageId = (value: string | null | undefined): number | null => {
  if (typeof value !== 'string') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseDepth = (value: string | null): number => {
  if (typeof value !== 'string') return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(4, Math.max(0, parsed));
};

const parseObjectBody = async (req: NextRequest): Promise<Record<string, unknown> | null> => {
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function GET(req: NextRequest, context: RouteParams) {
  const auth = await authenticateRequest(req);
  const params = await context.params;
  const pageId = parsePageId(params.id ?? null);
  if (pageId == null) {
    return corsJson(req, { error: 'Invalid page id.' }, { status: 400 }, METHODS);
  }

  const depth = parseDepth(req.nextUrl.searchParams.get('depth'));

  try {
    const readReq = auth.user ? await buildRequestForUser(auth.payload, auth.user) : undefined;
    const pageDoc = await auth.payload.findByID({
      collection: 'pages',
      id: pageId,
      depth,
      req: readReq,
      overrideAccess: false,
    });

    const revisionState = await ensureEditorDocumentRevision({
      payload: auth.payload,
      documentType: 'page',
      documentId: pageId,
    });
    const etag = buildEditorDocumentEtag({
      documentType: 'page',
      documentId: pageId,
      revision: revisionState.revision,
    });

    const response = corsJson(
      req,
      {
        doc: pageDoc,
        revision: revisionState.revision,
        etag,
      },
      {},
      METHODS,
    );
    response.headers.set('ETag', etag);
    response.headers.append('Vary', 'If-Match');
    return response;
  } catch (error: any) {
    const message =
      error?.data?.error ||
      error?.message ||
      'Unable to load page.';
    const status =
      typeof error?.status === 'number' && error.status >= 400
        ? error.status
        : typeof error?.statusCode === 'number' && error.statusCode >= 400
          ? error.statusCode
          : 404;
    return corsJson(req, { error: message }, { status }, METHODS);
  }
}

export async function PATCH(req: NextRequest, context: RouteParams) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const params = await context.params;
  const pageId = parsePageId(params.id ?? null);
  if (pageId == null) {
    return corsJson(req, { error: 'Invalid page id.' }, { status: 400 }, METHODS);
  }

  const userId = normaliseId(auth.user.id);
  if (userId == null) {
    return corsJson(req, { error: 'Unable to resolve authenticated user.' }, { status: 401 }, METHODS);
  }

  let idempotencyContext:
    | {
        key: string;
        active: boolean;
      }
    | null = null;

  try {
    const pageAccess = await resolvePageEditAccess({
      payload: auth.payload,
      pageId,
      user: auth.user,
      adminMode: auth.adminMode,
    });

    if (!pageAccess.page) {
      return corsJson(req, { error: 'Page not found.' }, { status: 404 }, METHODS);
    }

    if (!pageAccess.canEdit) {
      return corsJson(req, { error: 'Editor access denied for this page.' }, { status: 403 }, METHODS);
    }

    const payloadBody = await parseObjectBody(req);
    if (!payloadBody) {
      return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
    }

    const idempotencyKey = sanitiseEditorIdempotencyKey(
      req.headers.get('x-idempotency-key') ?? payloadBody.idempotencyKey,
    );
    if (!idempotencyKey) {
      return corsJson(
        req,
        { error: 'x-idempotency-key header (or idempotencyKey field) is required.' },
        { status: 400 },
        METHODS,
      );
    }
    const idempotencyKeyHash = hashEditorLogToken(idempotencyKey);
    recordEditorWriteAttempt(auth.payload.logger ?? console, 'page');

    const revisionState = await ensureEditorDocumentRevision({
      payload: auth.payload,
      documentType: 'page',
      documentId: pageId,
    });
    const revisionEtag = buildEditorDocumentEtag({
      documentType: 'page',
      documentId: pageId,
      revision: revisionState.revision,
    });

    const baseRevision = resolveEditorBaseRevision({
      baseRevision: payloadBody.baseRevision,
      ifMatch: req.headers.get('if-match'),
      documentType: 'page',
      documentId: pageId,
    });

    if (!baseRevision) {
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_base_revision_required',
          documentType: 'page',
          documentId: pageId,
          actorId: userId,
          idempotencyKeyHash,
          serverRevision: revisionState.revision,
        },
        '[editor-write] base revision missing',
      );
      const response = corsJson(
        req,
        {
          error: 'baseRevision (or If-Match) is required for editor writes.',
          code: 'base_revision_required',
          serverRevision: revisionState.revision,
          etag: revisionEtag,
        },
        { status: 400 },
        METHODS,
      );
      response.headers.set('ETag', revisionEtag);
      response.headers.append('Vary', 'If-Match');
      return response;
    }

    if (baseRevision !== revisionState.revision) {
      recordEditorWriteConflict(auth.payload.logger ?? console, 'page', 'stale_revision');
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_conflict',
          documentType: 'page',
          documentId: pageId,
          actorId: userId,
          idempotencyKeyHash,
          baseRevision,
          serverRevision: revisionState.revision,
          reason: 'stale_revision',
        },
        '[editor-write] revision conflict',
      );
      const conflictPayload = {
        error: 'Revision conflict. Reload latest page data and retry.',
        code: 'revision_conflict',
        serverRevision: revisionState.revision,
        etag: revisionEtag,
      };
      const response = corsJson(req, conflictPayload, { status: 409 }, METHODS);
      response.headers.set('ETag', revisionEtag);
      response.headers.append('Vary', 'If-Match');
      return response;
    }

    const editorSessionId =
      sanitiseEditorSessionId(payloadBody.sessionId) ??
      sanitiseEditorSessionId(req.headers.get('x-editor-session-id'));
    const activeLock = await loadEditorDocumentLock({
      payload: auth.payload,
      documentType: 'page',
      documentId: pageId,
    });

    if (activeLock) {
      const expiresMs = Date.parse(activeLock.expiresAt);
      const lockIsActive = Number.isFinite(expiresMs) ? expiresMs > Date.now() : true;
      const sameHolder =
        activeLock.holderUserId === userId &&
        (!editorSessionId || activeLock.holderSessionId === editorSessionId);
      if (lockIsActive && !sameHolder) {
        recordEditorWriteConflict(auth.payload.logger ?? console, 'page', 'locked');
        auth.payload.logger?.warn?.(
          {
            event: 'editor_write_locked',
            documentType: 'page',
            documentId: pageId,
            actorId: userId,
            idempotencyKeyHash,
            baseRevision,
            serverRevision: revisionState.revision,
            holderUserId: activeLock.holderUserId,
            holderSessionId: activeLock.holderSessionId,
            expiresAt: activeLock.expiresAt,
            lockMode: activeLock.lockMode,
          },
          '[editor-write] blocked by active lock',
        );
        return corsJson(
          req,
          {
            error: 'Document is currently locked by another editor session.',
            code: 'editor_locked',
            lock: activeLock,
          },
          { status: 423 },
          METHODS,
        );
      }
    }

    const {
      baseRevision: _baseRevision,
      idempotencyKey: _idempotencyKey,
      sessionId: _sessionId,
      ...data
    } = payloadBody;

    if (Object.keys(data).length === 0) {
      return corsJson(req, { error: 'No updates were provided.' }, { status: 400 }, METHODS);
    }

    const requestHash = hashEditorMutationPayload({
      ...payloadBody,
      documentType: 'page',
      documentId: pageId,
    });

    const idempotencyStart = await beginEditorWriteIdempotency({
      payload: auth.payload,
      documentType: 'page',
      documentId: pageId,
      idempotencyKey,
      requestHash,
    });

    if (idempotencyStart.status === 'replay') {
      recordEditorIdempotencyReplay(auth.payload.logger ?? console, 'page');
      auth.payload.logger?.info?.(
        {
          event: 'editor_write_idempotency_replay',
          documentType: 'page',
          documentId: pageId,
          actorId: userId,
          idempotencyKeyHash,
          baseRevision,
          replayStatus: idempotencyStart.responseStatus,
          resultingRevision: idempotencyStart.resultingRevision,
        },
        '[editor-write] idempotency replay',
      );
      const replayBody =
        idempotencyStart.responseBody && typeof idempotencyStart.responseBody === 'object'
          ? idempotencyStart.responseBody
          : { ok: true };
      const response = corsJson(
        req,
        replayBody,
        { status: idempotencyStart.responseStatus },
        METHODS,
      );
      if (idempotencyStart.resultingRevision != null) {
        const replayEtag = buildEditorDocumentEtag({
          documentType: 'page',
          documentId: pageId,
          revision: idempotencyStart.resultingRevision,
        });
        response.headers.set('ETag', replayEtag);
        response.headers.append('Vary', 'If-Match');
      }
      return response;
    }

    if (idempotencyStart.status === 'conflict') {
      recordEditorWriteConflict(auth.payload.logger ?? console, 'page', 'idempotency_conflict');
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_idempotency_conflict',
          documentType: 'page',
          documentId: pageId,
          actorId: userId,
          idempotencyKeyHash,
          baseRevision,
        },
        '[editor-write] idempotency key conflict',
      );
      return corsJson(
        req,
        {
          error: idempotencyStart.message,
          code: 'idempotency_conflict',
        },
        { status: 409 },
        METHODS,
      );
    }

    if (idempotencyStart.status === 'in_progress') {
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_idempotency_in_progress',
          documentType: 'page',
          documentId: pageId,
          actorId: userId,
          idempotencyKeyHash,
          baseRevision,
        },
        '[editor-write] idempotency key already in progress',
      );
      return corsJson(
        req,
        {
          error: 'A matching write is already in progress. Retry shortly.',
          code: 'idempotency_in_progress',
        },
        { status: 409 },
        METHODS,
      );
    }

    idempotencyContext = {
      key: idempotencyKey,
      active: true,
    };

    const writeReq = await buildRequestForUser(auth.payload, auth.user);
    const updated = await auth.payload.update({
      collection: 'pages',
      id: pageId,
      data,
      depth: 1,
      req: writeReq,
      overrideAccess: false,
    });

    const bumpedRevision = await bumpEditorDocumentRevision({
      payload: auth.payload,
      documentType: 'page',
      documentId: pageId,
      expectedRevision: baseRevision,
    });

    if (!bumpedRevision) {
      recordEditorWriteConflict(
        auth.payload.logger ?? console,
        'page',
        'post_update_bump_failed',
      );
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_conflict',
          documentType: 'page',
          documentId: pageId,
          actorId: userId,
          idempotencyKeyHash,
          baseRevision,
          reason: 'post_update_bump_failed',
        },
        '[editor-write] revision bump conflict',
      );
      const conflictPayload = {
        error: 'Revision conflict. Reload latest page data and retry.',
        code: 'revision_conflict',
      };
      await completeEditorWriteIdempotency({
        payload: auth.payload,
        documentType: 'page',
        documentId: pageId,
        idempotencyKey,
        responseStatus: 409,
        responseBody: conflictPayload,
        resultingRevision: null,
      });
      idempotencyContext.active = false;
      return corsJson(req, conflictPayload, { status: 409 }, METHODS);
    }

    const responsePayload = {
      doc: updated,
      revision: bumpedRevision.revision,
      etag: buildEditorDocumentEtag({
        documentType: 'page',
        documentId: pageId,
        revision: bumpedRevision.revision,
      }),
    };

    await completeEditorWriteIdempotency({
      payload: auth.payload,
      documentType: 'page',
      documentId: pageId,
      idempotencyKey,
      responseStatus: 200,
      responseBody: responsePayload,
      resultingRevision: bumpedRevision.revision,
    });
    idempotencyContext.active = false;
    recordEditorWriteCommit(auth.payload.logger ?? console, 'page');

    auth.payload.logger?.info?.(
      {
        event: 'editor_write_commit',
        documentType: 'page',
        documentId: pageId,
        actorId: userId,
        idempotencyKeyHash,
        baseRevision,
        resultingRevision: bumpedRevision.revision,
        operationCount: Object.keys(data).length,
      },
      '[editor-write] commit success',
    );

    const response = corsJson(req, responsePayload, {}, METHODS);
    response.headers.set('ETag', responsePayload.etag);
    response.headers.append('Vary', 'If-Match');
    return response;
  } catch (error: any) {
    if (idempotencyContext?.active) {
      try {
        const failurePayload = {
          error: error?.data?.error || error?.message || 'Unable to update page.',
          code: 'update_failed',
        };
        await completeEditorWriteIdempotency({
          payload: auth.payload,
          documentType: 'page',
          documentId: pageId,
          idempotencyKey: idempotencyContext.key,
          responseStatus: 400,
          responseBody: failurePayload,
          resultingRevision: null,
        });
      } catch {
        // Ignore idempotency persistence failures so the API error can still surface.
      }
    }

    const message = error?.data?.error || error?.message || 'Unable to update page.';
    auth.payload.logger?.error?.(
      {
        event: 'editor_write_failed',
        documentType: 'page',
        documentId: pageId,
        actorId: userId,
        err: error,
      },
      '[editor-write] commit failed',
    );
    return corsJson(req, { error: message }, { status: 400 }, METHODS);
  }
}
