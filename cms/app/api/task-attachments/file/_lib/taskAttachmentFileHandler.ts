import { NextResponse, type NextRequest } from 'next/server';

import {
  resolveMediaDownloadAccess,
  resolveMediaGovernanceMode,
  resolveTaskAttachmentFileReadAccess,
} from '@/app/api/_lib/mediaAccess';
import { recordMediaGovernanceAudit } from '@/app/api/_lib/mediaGovernance';
import {
  resolveMediaRequestState,
  tryServeSeaweedThenLocalClassResponse,
  withCorsErrorForMethod,
  withCorsNotFoundError,
} from '@/app/api/_lib/mediaFileRoute';
import { resolveSignedRedirectUrlForMedia } from '@/app/api/_lib/mediaPrivateDelivery';
import type {
  MediaMethodHandlerArgs,
  MediaRequestMethod,
  MediaSlugParamsContext,
} from '@/app/api/_lib/mediaFileRoute';

const TASK_ATTACHMENT_NOT_FOUND_ERROR = 'Task attachment not found.';

const authorizeTaskAttachmentRead = async ({
  request,
  relativePath,
  method,
  downloadRequested,
}: {
  request: NextRequest;
  relativePath: string;
  method: MediaRequestMethod;
  downloadRequested: boolean;
}): Promise<NextResponse | null> => {
  const governanceMode = resolveMediaGovernanceMode();
  if (governanceMode === 'off') return null;

  const { authenticateRequest } = await import('@/app/api/_lib/auth');
  const { payload, user, adminMode } = await authenticateRequest(request);
  const access = await resolveTaskAttachmentFileReadAccess({
    payload: payload as any,
    user,
    relativePath,
    adminMode,
  });
  if (!access.allow) {
    recordMediaGovernanceAudit({
      payload: payload as any,
      user,
      scope: 'task-attachment-file',
      action: 'view',
      decision: 'deny',
      mode: governanceMode,
      status: access.status,
      reason: access.error,
      relativePath,
    });
    if (governanceMode === 'enforce') {
      return withCorsErrorForMethod({
        request,
        method,
        status: access.status,
        error: access.error,
      });
    }
    return null;
  }

  recordMediaGovernanceAudit({
    payload: payload as any,
    user,
    scope: 'task-attachment-file',
    action: 'view',
    decision: 'allow',
    mode: governanceMode,
    relativePath,
  });

  if (!downloadRequested) return null;
  const downloadAccess = await resolveMediaDownloadAccess({
    scope: 'task-attachment-file',
    payload: payload as any,
    user,
    relativePath,
    adminMode,
  });
  if (!downloadAccess.allow) {
    recordMediaGovernanceAudit({
      payload: payload as any,
      user,
      scope: 'task-attachment-file',
      action: 'download',
      decision: 'deny',
      mode: governanceMode,
      status: downloadAccess.status,
      reason: downloadAccess.error,
      relativePath,
    });
    if (governanceMode === 'enforce') {
      return withCorsErrorForMethod({
        request,
        method,
        status: downloadAccess.status,
        error: downloadAccess.error,
      });
    }
    return null;
  }

  recordMediaGovernanceAudit({
    payload: payload as any,
    user,
    scope: 'task-attachment-file',
    action: 'download',
    decision: 'allow',
    mode: governanceMode,
    relativePath,
  });

  if (governanceMode === 'enforce') {
    const redirectUrl = resolveSignedRedirectUrlForMedia({
      mediaClass: 'tasks',
      objectPath: relativePath,
      downloadFilename: relativePath.split('/').pop() ?? 'media',
    });
    if (redirectUrl) return NextResponse.redirect(redirectUrl, 307);
  }

  return null;
};

export const handleTaskAttachmentRequest = async ({
  request,
  context,
  method,
}: MediaMethodHandlerArgs<MediaSlugParamsContext>): Promise<NextResponse> => {
  const { relativePath, downloadRequested } = await resolveMediaRequestState({
    request,
    context,
  });
  if (!relativePath)
    return withCorsNotFoundError({
      request,
      error: TASK_ATTACHMENT_NOT_FOUND_ERROR,
    });

  const denied = await authorizeTaskAttachmentRead({
    request,
    relativePath,
    method,
    downloadRequested,
  });
  if (denied) return denied;

  const mediaResponse = await tryServeSeaweedThenLocalClassResponse({
    request,
    mediaClass: 'tasks',
    relativePath,
    method,
    downloadRequested,
  });
  if (mediaResponse) return mediaResponse;

  return withCorsNotFoundError({
    request,
    error: TASK_ATTACHMENT_NOT_FOUND_ERROR,
  });
};
