import { NextResponse, type NextRequest } from 'next/server';

import {
  resolveAvatarFileReadAccess,
  resolveMediaDownloadAccess,
  resolveMediaGovernanceMode,
} from '@/app/api/_lib/mediaAccess';
import { recordMediaGovernanceAudit } from '@/app/api/_lib/mediaGovernance';
import { resolveSignedRedirectUrlForMedia } from '@/app/api/_lib/mediaPrivateDelivery';
import {
  isImageFallbackRequested,
  resolveMediaRequestState,
  tryServeSeaweedThenLocalClassResponse,
  withCorsErrorForMethod,
  withMissingImageFallbackDownloadResponse,
  withCorsNotFoundError,
} from '@/app/api/_lib/mediaFileRoute';
import { deduceAvatarMediaType } from '@astralpirates/shared/avatarMedia';
import type {
  MediaMethodHandlerArgs,
  MediaRequestMethod,
  MediaSlugParamsContext,
} from '@/app/api/_lib/mediaFileRoute';

const AVATAR_NOT_FOUND_ERROR = 'Avatar not found.';

const authorizeAvatarRead = async ({
  request,
  method,
  downloadRequested,
  relativePath,
}: {
  request: NextRequest;
  method: MediaRequestMethod;
  downloadRequested: boolean;
  relativePath: string;
}): Promise<NextResponse | null> => {
  const governanceMode = resolveMediaGovernanceMode();

  const access = resolveAvatarFileReadAccess();
  if (!access.allow)
    return withCorsErrorForMethod({
      request,
      method,
      status: access.status,
      error: access.error,
    });

  if (!downloadRequested || governanceMode === 'off') return null;

  const { authenticateRequest } = await import('@/app/api/_lib/auth');
  const { payload, user, adminMode } = await authenticateRequest(request);
  const downloadAccess = await resolveMediaDownloadAccess({
    scope: 'avatar-file',
    user,
    adminMode,
  });
  if (!downloadAccess.allow) {
    recordMediaGovernanceAudit({
      payload: payload as any,
      user,
      scope: 'avatar-file',
      action: 'download',
      decision: 'deny',
      mode: governanceMode,
      status: downloadAccess.status,
      reason: downloadAccess.error,
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
    scope: 'avatar-file',
    action: 'download',
    decision: 'allow',
    mode: governanceMode,
  });

  if (governanceMode === 'enforce') {
    const redirectUrl = resolveSignedRedirectUrlForMedia({
      mediaClass: 'avatars',
      objectPath: relativePath,
      downloadFilename: relativePath.split('/').pop() ?? 'avatar',
    });
    if (redirectUrl) return NextResponse.redirect(redirectUrl, 307);
  }
  return null;
};

export const handleAvatarRequest = async ({
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
      error: AVATAR_NOT_FOUND_ERROR,
    });

  const denied = await authorizeAvatarRead({
    request,
    method,
    downloadRequested,
    relativePath,
  });
  if (denied) return denied;

  const mediaResponse = await tryServeSeaweedThenLocalClassResponse({
    request,
    mediaClass: 'avatars',
    relativePath,
    method,
    downloadRequested,
  });
  if (mediaResponse) return mediaResponse;

  const allowImageFallback =
    deduceAvatarMediaType({ filename: relativePath, url: relativePath }) === 'image';

  if (allowImageFallback && isImageFallbackRequested(request.nextUrl?.searchParams))
    return withMissingImageFallbackDownloadResponse({
      request,
      mediaClass: 'avatars',
      method,
      relativePath,
      downloadRequested,
    });

  return withCorsNotFoundError({
    request,
    error: AVATAR_NOT_FOUND_ERROR,
  });
};
