import { type NextResponse } from 'next/server';

import {
  resolveMediaRequestState,
  tryServeSeaweedThenLocalClassResponse,
  withCorsNotFoundError,
} from '@/app/api/_lib/mediaFileRoute';
import type {
  MediaMethodHandlerArgs,
  MediaSlugParamsContext,
} from '@/app/api/_lib/mediaFileRoute';

const HONOR_BADGE_MEDIA_NOT_FOUND_ERROR = 'Honor badge media not found.';

export const handleHonorBadgeMediaRequest = async ({
  request,
  context,
  method,
}: MediaMethodHandlerArgs<MediaSlugParamsContext>): Promise<NextResponse> => {
  const { relativePath, downloadRequested } = await resolveMediaRequestState({
    request,
    context,
  });

  if (!relativePath) {
    return withCorsNotFoundError({
      request,
      error: HONOR_BADGE_MEDIA_NOT_FOUND_ERROR,
    });
  }

  const mediaResponse = await tryServeSeaweedThenLocalClassResponse({
    request,
    mediaClass: 'badges',
    relativePath,
    method,
    downloadRequested,
  });

  if (mediaResponse) {
    return mediaResponse;
  }

  return withCorsNotFoundError({
    request,
    error: HONOR_BADGE_MEDIA_NOT_FOUND_ERROR,
  });
};
