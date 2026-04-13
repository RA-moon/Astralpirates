import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  normaliseEditorDocumentType,
  normaliseEditorLockMode,
  resolveEditorDocumentEditAccess,
  sanitiseEditorSessionId,
  type EditorDocumentType,
  type EditorLockMode,
} from '@/app/api/_lib/editorWrites';
import { corsJson } from '@/app/api/_lib/cors';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';

export type EditorLockRequestContext = {
  auth: Awaited<ReturnType<typeof authenticateRequest>>;
  userId: number;
  body: Record<string, unknown>;
  documentType: EditorDocumentType;
  documentId: number;
  sessionId: string;
  leaseSeconds: number;
  lockMode: EditorLockMode;
};

type EditorLockAccessCheckResult =
  | { ok: true }
  | { ok: false; response: Response };

const parseLeaseSeconds = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 90;
};

const parseBody = async (req: NextRequest): Promise<Record<string, unknown> | null> => {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const parseEditorLockRequest = async (
  req: NextRequest,
): Promise<
  | {
      ok: true;
      value: EditorLockRequestContext;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> => {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }

  const userId = normaliseId(auth.user.id);
  if (userId == null) {
    return { ok: false, status: 401, error: 'Unable to resolve authenticated user.' };
  }

  const body = await parseBody(req);
  if (!body) {
    return { ok: false, status: 400, error: 'Invalid JSON payload.' };
  }

  const documentType = normaliseEditorDocumentType(body.documentType);
  if (!documentType) {
    return {
      ok: false,
      status: 400,
      error: 'documentType must be one of: flight-plan, page.',
    };
  }

  const documentId = normaliseId(body.documentId);
  if (documentId == null) {
    return { ok: false, status: 400, error: 'documentId must be a positive integer.' };
  }

  const sessionId =
    sanitiseEditorSessionId(body.sessionId) ??
    sanitiseEditorSessionId(req.headers.get('x-editor-session-id'));
  if (!sessionId) {
    return {
      ok: false,
      status: 400,
      error: 'sessionId (or x-editor-session-id header) is required.',
    };
  }

  const lockMode = normaliseEditorLockMode(body.lockMode) ?? 'soft';
  const leaseSeconds = parseLeaseSeconds(body.leaseSeconds);

  return {
    ok: true,
    value: {
      auth,
      userId,
      body,
      documentType,
      documentId,
      sessionId,
      leaseSeconds,
      lockMode,
    },
  };
};

export const ensureEditorLockEditAccess = async ({
  req,
  methods,
  context,
}: {
  req: NextRequest;
  methods: string;
  context: EditorLockRequestContext;
}): Promise<EditorLockAccessCheckResult> => {
  const access = await resolveEditorDocumentEditAccess({
    payload: context.auth.payload,
    user: context.auth.user,
    documentType: context.documentType,
    documentId: context.documentId,
    adminMode: context.auth.adminMode,
  });

  if (!access.exists) {
    return {
      ok: false,
      response: corsJson(req, { error: 'Document not found.' }, { status: 404 }, methods),
    };
  }

  if (!access.canEdit) {
    return {
      ok: false,
      response: corsJson(
        req,
        { error: 'Editor access denied for this document.' },
        { status: 403 },
        methods,
      ),
    };
  }

  return { ok: true };
};

export const parseTakeoverReason = (body: Record<string, unknown>): string | null => {
  if (typeof body.reason !== 'string') return null;
  const trimmed = body.reason.trim();
  return trimmed.length > 0 ? trimmed : null;
};
