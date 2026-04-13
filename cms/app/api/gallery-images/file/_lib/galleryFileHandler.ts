import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';

import {
  resolveGalleryFileReadAccess,
  resolveMediaDownloadAccess,
  resolveMediaGovernanceMode,
} from '@/app/api/_lib/mediaAccess';
import { isMediaAudioEnabled } from '@/app/api/_lib/mediaAudio';
import {
  fetchSeaweedObjectForClass,
  isImageFallbackRequested,
  isSeaweedProviderEnabled,
  resolveMediaRequestState,
  tryServeLocalClassResponse,
  withCorsDownloadResponse,
  withCorsErrorForMethod,
  withMissingImageFallbackDownloadResponse,
  withCorsNotFoundError,
} from '@/app/api/_lib/mediaFileRoute';
import { recordMediaGovernanceAudit } from '@/app/api/_lib/mediaGovernance';
import { resolveSignedRedirectUrlForMedia } from '@/app/api/_lib/mediaPrivateDelivery';
import type {
  MediaFetchResult,
  MediaMethodHandlerArgs,
  MediaRequestMethod,
  MediaSlugParamsContext,
} from '@/app/api/_lib/mediaFileRoute';

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);
const AUDIO_EXTENSIONS = new Set(['.aac', '.m4a', '.mp3', '.oga', '.wav']);
const LEGACY_SUFFIX_MAX = 5;

const GALLERY_ASSET_NOT_FOUND_ERROR = 'Gallery asset not found.';

const isAudioRelativePath = (relativePath: string): boolean =>
  AUDIO_EXTENSIONS.has(path.extname(relativePath).toLowerCase());

const buildLegacyObjectPathFallbacks = (relativePath: string): string[] => {
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath || normalizedPath.includes('..')) return [];

  const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);
  if (!segments.length) return [];
  const filename = segments[segments.length - 1] ?? '';

  const extensionIndex = filename.lastIndexOf('.');
  if (extensionIndex <= 0) return [];

  const extension = filename.slice(extensionIndex);
  const stem = filename.slice(0, extensionIndex);

  const suffixMatch = stem.match(/^(.*)-(\d+)$/);
  const baseStem = suffixMatch?.[1] ?? stem;
  const numberedSuffix = suffixMatch ? Number.parseInt(suffixMatch[2], 10) : null;
  const boundedNumericSuffix =
    numberedSuffix != null &&
    Number.isFinite(numberedSuffix) &&
    numberedSuffix > 0 &&
    numberedSuffix <= LEGACY_SUFFIX_MAX
      ? numberedSuffix
      : null;

  const candidateStems: string[] = [];
  if (boundedNumericSuffix != null) {
    for (let index = boundedNumericSuffix - 1; index >= 1; index -= 1) {
      candidateStems.push(`${baseStem}-${index}`);
    }
    candidateStems.push(baseStem);
  } else {
    for (let index = 1; index <= LEGACY_SUFFIX_MAX; index += 1) {
      candidateStems.push(`${stem}-${index}`);
    }
  }

  const parentPath = segments.slice(0, -1).join('/');
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const candidateStem of candidateStems) {
    const candidateFilename = `${candidateStem}${extension}`;
    const candidatePath = parentPath ? `${parentPath}/${candidateFilename}` : candidateFilename;
    if (candidatePath === normalizedPath || seen.has(candidatePath)) continue;
    seen.add(candidatePath);
    candidates.push(candidatePath);
  }

  return candidates;
};

const fetchSeaweedObjectWithFallback = async ({
  objectPath,
  fallbackPaths,
  method,
  rangeHeader,
}: {
  objectPath: string;
  fallbackPaths: readonly string[];
  method: MediaRequestMethod;
  rangeHeader?: string | null;
}): Promise<MediaFetchResult> => {
  const primary = await fetchSeaweedObjectForClass({
    mediaClass: 'gallery',
    objectPath,
    method,
    rangeHeader,
  });
  if (primary.response) return primary;

  const attempts = [...primary.attempts];
  for (const fallbackPath of fallbackPaths) {
    attempts.push(`fallback:${fallbackPath}`);
    const fallback = await fetchSeaweedObjectForClass({
      mediaClass: 'gallery',
      objectPath: fallbackPath,
      method,
      rangeHeader,
    });
    attempts.push(...fallback.attempts);
    if (fallback.response) return { response: fallback.response, attempts };
  }

  return { response: null, attempts };
};

const authorizeGalleryRead = async ({
  request,
  relativePath,
  fallbackPaths,
  method,
  downloadRequested,
}: {
  request: NextRequest;
  relativePath: string;
  fallbackPaths: readonly string[];
  method: MediaRequestMethod;
  downloadRequested: boolean;
}): Promise<NextResponse | null> => {
  const governanceMode = resolveMediaGovernanceMode();
  if (governanceMode === 'off') return null;

  const { authenticateRequest } = await import('@/app/api/_lib/auth');
  const { payload, user, adminMode } = await authenticateRequest(request);
  const access = await resolveGalleryFileReadAccess({
    payload: payload as any,
    user,
    relativePath,
    fallbackPaths,
    adminMode,
  });
  if (!access.allow) {
    recordMediaGovernanceAudit({
      payload: payload as any,
      user,
      scope: 'gallery-file',
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
    scope: 'gallery-file',
    action: 'view',
    decision: 'allow',
    mode: governanceMode,
    relativePath,
  });

  if (!downloadRequested) return null;
  const downloadAccess = await resolveMediaDownloadAccess({
    scope: 'gallery-file',
    payload: payload as any,
    user,
    relativePath,
    fallbackPaths,
    adminMode,
  });
  if (!downloadAccess.allow) {
    recordMediaGovernanceAudit({
      payload: payload as any,
      user,
      scope: 'gallery-file',
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
    scope: 'gallery-file',
    action: 'download',
    decision: 'allow',
    mode: governanceMode,
    relativePath,
  });

  if (governanceMode === 'enforce') {
    const redirectUrl = resolveSignedRedirectUrlForMedia({
      mediaClass: 'gallery',
      objectPath: relativePath,
      downloadFilename: relativePath.split('/').pop() ?? 'media',
    });
    if (redirectUrl) return NextResponse.redirect(redirectUrl, 307);
  }

  return null;
};

const buildGalleryNotFoundResponse = ({
  request,
  debugProxy,
  upstreamAttempts,
}: {
  request: NextRequest;
  debugProxy?: boolean;
  upstreamAttempts?: readonly string[];
}): NextResponse => {
  const response = withCorsNotFoundError({
    request,
    error: GALLERY_ASSET_NOT_FOUND_ERROR,
  });
  if (debugProxy && upstreamAttempts?.length)
    response.headers.set('X-Astral-Gallery-Upstream', upstreamAttempts.slice(0, 8).join(','));
  return response;
};

const logAudioStreamFailure = ({
  request,
  relativePath,
  status,
  reason,
  source,
}: {
  request: NextRequest;
  relativePath: string;
  status: number;
  reason: string;
  source: 'policy' | 'upstream' | 'local';
}) => {
  console.warn('[gallery-audio-stream] request failed', {
    mediaType: 'audio',
    reason,
    source,
    status,
    routePath: request.nextUrl.pathname,
    relativePath,
    range: request.headers.get('range'),
  });
};

const tryServeGallerySeaweedResponse = async ({
  request,
  relativePath,
  fallbackPaths,
  method,
  downloadRequested,
}: {
  request: NextRequest;
  relativePath: string;
  fallbackPaths: readonly string[];
  method: MediaRequestMethod;
  downloadRequested: boolean;
}): Promise<MediaFetchResult> => {
  if (!isSeaweedProviderEnabled()) return { response: null, attempts: [] };
  const rangeHeader = method === 'GET' ? request.headers.get('range') : null;

  const upstream = await fetchSeaweedObjectWithFallback({
    objectPath: relativePath,
    fallbackPaths,
    method,
    rangeHeader,
  });
  if (!upstream.response) return { response: null, attempts: upstream.attempts };

  return {
    response: withCorsDownloadResponse({
      request,
      response: upstream.response,
      relativePath,
      downloadRequested,
    }),
    attempts: upstream.attempts,
  };
};

export const handleGalleryRequest = async ({
  request,
  context,
  method,
}: MediaMethodHandlerArgs<MediaSlugParamsContext>): Promise<NextResponse> => {
  const debugProxy = request.headers.get('x-astral-debug-gallery') === '1';
  const { relativePath, downloadRequested } = await resolveMediaRequestState({
    request,
    context,
  });
  if (!relativePath) return buildGalleryNotFoundResponse({ request });

  const audioRequest = isAudioRelativePath(relativePath);
  if (!isMediaAudioEnabled() && audioRequest) {
    logAudioStreamFailure({
      request,
      relativePath,
      status: 404,
      reason: 'audio-disabled',
      source: 'policy',
    });
    return buildGalleryNotFoundResponse({ request });
  }

  const fallbackPaths = buildLegacyObjectPathFallbacks(relativePath);
  const deniedResponse = await authorizeGalleryRead({
    request,
    relativePath,
    fallbackPaths,
    method,
    downloadRequested,
  });
  if (deniedResponse) return deniedResponse;

  const upstream = await tryServeGallerySeaweedResponse({
    request,
    relativePath,
    fallbackPaths,
    method,
    downloadRequested,
  });
  if (upstream.response) {
    if (audioRequest && upstream.response.status === 416) {
      logAudioStreamFailure({
        request,
        relativePath,
        status: 416,
        reason: 'range-unsatisfiable',
        source: 'upstream',
      });
    }
    return upstream.response;
  }

  const localResponse = await tryServeLocalClassResponse({
    request,
    mediaClass: 'gallery',
    relativePath,
    method,
    downloadRequested,
  });
  if (localResponse) {
    if (audioRequest && localResponse.status === 416) {
      logAudioStreamFailure({
        request,
        relativePath,
        status: 416,
        reason: 'range-unsatisfiable',
        source: 'local',
      });
    }
    return localResponse;
  }

  for (const fallbackPath of fallbackPaths) {
    const fallbackResponse = await tryServeLocalClassResponse({
      request,
      mediaClass: 'gallery',
      relativePath: fallbackPath,
      downloadRelativePath: relativePath,
      method,
      downloadRequested,
    });
    if (!fallbackResponse) continue;
    if (audioRequest && fallbackResponse.status === 416) {
      logAudioStreamFailure({
        request,
        relativePath,
        status: 416,
        reason: 'range-unsatisfiable',
        source: 'local',
      });
    }
    if (debugProxy) fallbackResponse.headers.set('X-Astral-Gallery-Fallback', fallbackPath);
    return fallbackResponse;
  }

  if (
    isImageFallbackRequested(request.nextUrl?.searchParams) &&
    IMAGE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())
  ) {
    return withMissingImageFallbackDownloadResponse({
      request,
      mediaClass: 'gallery',
      method,
      relativePath,
      downloadRequested,
    });
  }

  if (audioRequest) {
    logAudioStreamFailure({
      request,
      relativePath,
      status: 404,
      reason: 'not-found',
      source: 'local',
    });
  }
  return buildGalleryNotFoundResponse({
    request,
    debugProxy,
    upstreamAttempts: upstream.attempts,
  });
};
