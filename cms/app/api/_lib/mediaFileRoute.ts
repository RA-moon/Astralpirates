import fs from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isMissingMediaImageFallbackMode,
  isArtifactMediaHostname,
  MEDIA_DEFAULT_BUCKETS,
  resolveMissingMediaFallbackMode,
  resolveMediaBucketName,
} from '@astralpirates/shared/mediaUrls';

const INTERNAL_S3_ENDPOINT_FALLBACKS = [
  'http://seaweedfs:8333',
  'http://astralpirates-seaweedfs:8333',
  'http://127.0.0.1:8333',
  'http://localhost:8333',
] as const;

const DOWNLOAD_QUERY_ALLOW_VALUES = new Set(['1', 'true', 'yes', 'on']);

const S3_SERVICE = 's3';
const AWS_ALGORITHM = 'AWS4-HMAC-SHA256';
const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

type S3Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

type ParsedByteRange =
  | { kind: 'none' }
  | { kind: 'valid'; start: number; end: number }
  | { kind: 'invalid' }
  | { kind: 'unsatisfiable' };

export type MediaRequestMethod = 'GET' | 'HEAD';
export type MediaSlugParams = { slug?: string[] };
export type MediaSlugParamsContext = { params: Promise<MediaSlugParams> };
export type MediaMethodHandlerArgs<TContext = MediaSlugParamsContext> = {
  request: NextRequest;
  context: TContext;
  method: MediaRequestMethod;
};
export type MediaFetchResult = { response: NextResponse | null; attempts: string[] };
export const MEDIA_FILE_ROUTE_RUNTIME = 'nodejs';
export const MEDIA_FILE_ROUTE_DYNAMIC = 'force-dynamic';
type S3FetchMethod = MediaRequestMethod;
type MediaClassKey = 'avatars' | 'gallery' | 'tasks' | 'badges';
type MissingImageClassKey = 'avatars' | 'gallery';

const MEDIA_BUCKET_ENV_KEYS: Record<MediaClassKey, string> = {
  avatars: 'MEDIA_BUCKET_AVATARS',
  gallery: 'MEDIA_BUCKET_GALLERY',
  tasks: 'MEDIA_BUCKET_TASKS',
  badges: 'MEDIA_BUCKET_BADGES',
};

const MEDIA_CACHE_CONTROL_VALUES: Record<MediaClassKey, string> = {
  avatars: 'public, max-age=86400',
  gallery: 'public, max-age=604800',
  tasks: 'public, max-age=604800',
  badges: 'public, max-age=86400',
};

const MEDIA_LOCAL_READ_FALLBACK_ENV_KEY = 'MEDIA_LOCAL_READ_FALLBACK_ENABLED';
const MEDIA_LOCAL_READ_FALLBACK_CLASS_ENV_KEYS: Record<MediaClassKey, string> = {
  avatars: 'MEDIA_AVATAR_LOCAL_READ_FALLBACK_ENABLED',
  gallery: 'MEDIA_GALLERY_LOCAL_READ_FALLBACK_ENABLED',
  tasks: 'MEDIA_TASK_LOCAL_READ_FALLBACK_ENABLED',
  badges: 'MEDIA_BADGE_LOCAL_READ_FALLBACK_ENABLED',
};
const MEDIA_LOG_LOCAL_FALLBACK_READS_ENV_KEY = 'MEDIA_LOG_LOCAL_FALLBACK_READS';
const MEDIA_RESPONSE_SOURCE_HEADER = 'X-Astral-Media-Source';

const BASE_IMAGE_CONTENT_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
} as const;

const MEDIA_CONTENT_TYPE_MAPS: Record<MediaClassKey, Readonly<Record<string, string>>> = {
  avatars: {
    ...BASE_IMAGE_CONTENT_TYPES,
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.webm': 'video/webm',
    '.fbx': 'model/vnd.fbx',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.obj': 'model/obj',
    '.stl': 'model/stl',
    '.usdz': 'model/vnd.usdz+zip',
  },
  gallery: {
    ...BASE_IMAGE_CONTENT_TYPES,
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.oga': 'audio/ogg',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.fbx': 'model/vnd.fbx',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.obj': 'model/obj',
    '.stl': 'model/stl',
    '.usdz': 'model/vnd.usdz+zip',
  },
  tasks: {
    ...BASE_IMAGE_CONTENT_TYPES,
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
  },
  badges: {
    ...BASE_IMAGE_CONTENT_TYPES,
    '.svg': 'image/svg+xml',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.webm': 'video/webm',
    '.fbx': 'model/vnd.fbx',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.obj': 'model/obj',
    '.stl': 'model/stl',
    '.usdz': 'model/vnd.usdz+zip',
  },
};

const MISSING_IMAGE_SVG_TEMPLATES: Record<MissingImageClassKey, string> = {
  avatars:
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>' +
    '<rect width="512" height="512" rx="256" fill="url(#bg)"/>' +
    '<circle cx="256" cy="206" r="86" fill="#334155"/>' +
    '<path d="M98 438c20-74 82-124 158-124s138 50 158 124" fill="#334155"/>' +
    '</svg>',
  gallery:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">' +
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#101828"/><stop offset="100%" stop-color="#1d2939"/></linearGradient></defs>' +
    '<rect width="1200" height="675" fill="url(#bg)"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
    'font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="46" fill="#cbd5e1">Media unavailable</text>' +
    '</svg>',
};

const MISSING_IMAGE_FALLBACK_KEYS: Record<MissingImageClassKey, string> = {
  avatars: 'missing-avatar',
  gallery: 'missing-image',
};

const trimValue = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

const parseOptionalBooleanEnv = (value: string | undefined): boolean | null => {
  const normalized = trimValue(value).toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const trimWrappedQuotes = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
};

const sanitizeEnvValue = (value: string | undefined): string =>
  trimWrappedQuotes(trimValue(value));

const normalizeEndpoint = (value: string): string =>
  value.replace(/\/+$/, '');

const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const toAmzDate = (value: Date): string =>
  value.toISOString().replace(/[:-]|\.\d{3}/g, '');

const hashSha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const hmacSha256 = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value).digest();

const hmacSha256Hex = (key: Buffer | string, value: string): string =>
  createHmac('sha256', key).update(value).digest('hex');

const buildCanonicalUri = (pathnameValue: string): string => {
  const normalized =
    pathnameValue && pathnameValue.startsWith('/') ? pathnameValue : `/${pathnameValue || ''}`;
  return normalized
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      try {
        return encodeRfc3986(decodeURIComponent(segment));
      } catch {
        return encodeRfc3986(segment);
      }
    })
    .join('/');
};

const buildCanonicalQueryString = (url: URL): string => {
  const queryEntries = Array.from(url.searchParams.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });

  return queryEntries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
};

const resolveS3Credentials = (): S3Credentials | null => {
  const accessKeyId =
    sanitizeEnvValue(process.env.MEDIA_S3_ACCESS_KEY_ID) ||
    sanitizeEnvValue(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey =
    sanitizeEnvValue(process.env.MEDIA_S3_SECRET_ACCESS_KEY) ||
    sanitizeEnvValue(process.env.AWS_SECRET_ACCESS_KEY);
  if (!accessKeyId || !secretAccessKey) return null;

  const region =
    sanitizeEnvValue(process.env.MEDIA_S3_REGION) ||
    sanitizeEnvValue(process.env.AWS_REGION) ||
    sanitizeEnvValue(process.env.AWS_DEFAULT_REGION) ||
    'us-east-1';

  return {
    accessKeyId,
    secretAccessKey,
    region,
  };
};

export const isSeaweedProviderEnabled = (): boolean =>
  (process.env.MEDIA_STORAGE_PROVIDER ?? 'local').trim().toLowerCase() === 'seaweedfs';

export const isLocalReadFallbackEnabledForClass = (
  mediaClass: MediaClassKey,
): boolean => {
  const classSetting = parseOptionalBooleanEnv(
    process.env[MEDIA_LOCAL_READ_FALLBACK_CLASS_ENV_KEYS[mediaClass]],
  );
  if (classSetting != null) return classSetting;

  const globalSetting = parseOptionalBooleanEnv(
    process.env[MEDIA_LOCAL_READ_FALLBACK_ENV_KEY],
  );
  if (globalSetting != null) return globalSetting;

  return true;
};

const shouldLogLocalFallbackReads = (): boolean =>
  parseOptionalBooleanEnv(process.env[MEDIA_LOG_LOCAL_FALLBACK_READS_ENV_KEY]) === true;

const resolveS3EndpointCandidates = (): string[] => {
  const configuredEndpoint = sanitizeEnvValue(process.env.MEDIA_S3_ENDPOINT);
  const internalOverride = sanitizeEnvValue(process.env.MEDIA_S3_INTERNAL_ENDPOINT);
  const preferInternalEndpoints = isArtifactMediaHostname(configuredEndpoint);
  const sourceEndpoints = preferInternalEndpoints
    ? [internalOverride, ...INTERNAL_S3_ENDPOINT_FALLBACKS, configuredEndpoint]
    : [internalOverride, configuredEndpoint, ...INTERNAL_S3_ENDPOINT_FALLBACKS];

  return Array.from(new Set(
    sourceEndpoints
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map(normalizeEndpoint),
  ));
};

const buildS3SignedHeaders = ({
  method,
  target,
  credentials,
}: {
  method: S3FetchMethod;
  target: URL;
  credentials: S3Credentials;
}): HeadersInit => {
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${credentials.region}/${S3_SERVICE}/aws4_request`;

  const canonicalUri = buildCanonicalUri(target.pathname);
  const canonicalQuery = buildCanonicalQueryString(target);
  const canonicalHeaders =
    `host:${target.host}\n` +
    `x-amz-content-sha256:${EMPTY_SHA256}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest =
    `${method}\n${canonicalUri}\n${canonicalQuery}\n` +
    `${canonicalHeaders}\n${signedHeaders}\n${EMPTY_SHA256}`;
  const stringToSign =
    `${AWS_ALGORITHM}\n${amzDate}\n${credentialScope}\n` +
    `${hashSha256Hex(canonicalRequest)}`;

  const signingKey = hmacSha256(
    hmacSha256(
      hmacSha256(
        hmacSha256(`AWS4${credentials.secretAccessKey}`, dateStamp),
        credentials.region,
      ),
      S3_SERVICE,
    ),
    'aws4_request',
  );

  const signature = hmacSha256Hex(signingKey, stringToSign);
  const authorization =
    `${AWS_ALGORITHM} ` +
    `Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return {
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': EMPTY_SHA256,
  };
};

const fetchSeaweedObject = async ({
  objectPath,
  method,
  bucket,
  cacheControl,
  rangeHeader,
}: {
  objectPath: string;
  method: S3FetchMethod;
  bucket: string;
  cacheControl: string;
  rangeHeader?: string | null;
}): Promise<MediaFetchResult> => {
  const endpoints = resolveS3EndpointCandidates();
  const credentials = resolveS3Credentials();
  const encodedObjectPath = objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const attempts: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const targetUrl = new URL(`${endpoint}/${bucket}/${encodedObjectPath}`);
      const signedHeaders = credentials
        ? buildS3SignedHeaders({ method, target: targetUrl, credentials })
        : undefined;
      const requestHeaders = new Headers(signedHeaders);
      if (method === 'GET' && rangeHeader) {
        requestHeaders.set('Range', rangeHeader);
      }
      const headers = Array.from(requestHeaders.keys()).length
        ? Object.fromEntries(requestHeaders.entries())
        : undefined;
      const authMode = signedHeaders ? 'signed' : 'unsigned';
      const response = await fetch(targetUrl, { method, headers });
      if (response.status === 416) {
        attempts.push(`${authMode}:${endpoint}:416`);
        const errorHeaders = new Headers();
        errorHeaders.set('Cache-Control', cacheControl);
        errorHeaders.set('Accept-Ranges', response.headers.get('Accept-Ranges') ?? 'bytes');
        const contentRange = response.headers.get('Content-Range');
        if (contentRange) errorHeaders.set('Content-Range', contentRange);
        return {
          response: new NextResponse(null, {
            status: 416,
            headers: errorHeaders,
          }),
          attempts,
        };
      }
      if (!response.ok) {
        attempts.push(`${authMode}:${endpoint}:${response.status}`);
        continue;
      }

      attempts.push(`${authMode}:${endpoint}:${response.status}`);
      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', response.headers.get('Content-Type') ?? 'application/octet-stream');
      responseHeaders.set('Cache-Control', cacheControl);
      responseHeaders.set('Accept-Ranges', response.headers.get('Accept-Ranges') ?? 'bytes');
      const contentLength = response.headers.get('Content-Length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);
      const contentRange = response.headers.get('Content-Range');
      if (contentRange) responseHeaders.set('Content-Range', contentRange);

      if (method === 'HEAD')
        return {
          response: new NextResponse(null, {
            status: response.status,
            headers: responseHeaders,
          }),
          attempts,
        };

      const body = await response.arrayBuffer();
      return {
        response: new NextResponse(body, {
          status: response.status,
          headers: responseHeaders,
        }),
        attempts,
      };
    } catch {
      attempts.push(`invalid-or-error:${endpoint}`);
    }
  }

  return { response: null, attempts };
};

export const findLocalFile = ({
  relativePath,
  roots,
}: {
  relativePath: string;
  roots: readonly string[];
}): string | null => {
  const safePath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
  if (!safePath || safePath.includes('..')) return null;

  for (const root of roots) {
    const candidate = path.join(root, safePath);
    if (!candidate.startsWith(root)) continue;
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
};

export const resolveMediaLocalRoots = (
  mediaClass: MediaClassKey,
): readonly string[] => [
  path.join(process.cwd(), 'public', 'media', mediaClass),
  path.join(process.cwd(), 'media', mediaClass),
];

const resolveMediaBucketForClass = (mediaClass: MediaClassKey): string => {
  const envKey = MEDIA_BUCKET_ENV_KEYS[mediaClass];
  return resolveMediaBucketName(process.env[envKey], MEDIA_DEFAULT_BUCKETS[mediaClass]);
};

const resolveMediaCacheControlForClass = (
  mediaClass: MediaClassKey,
): string => MEDIA_CACHE_CONTROL_VALUES[mediaClass];

const parseSingleByteRange = (
  rangeHeader: string | null,
  fileSize: number,
): ParsedByteRange => {
  if (!rangeHeader) return { kind: 'none' };
  if (!Number.isFinite(fileSize) || fileSize <= 0) return { kind: 'unsatisfiable' };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return { kind: 'invalid' };

  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  if (!startRaw && !endRaw) return { kind: 'invalid' };

  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { kind: 'invalid' };
    const chunkSize = Math.min(suffixLength, fileSize);
    return {
      kind: 'valid',
      start: Math.max(0, fileSize - chunkSize),
      end: fileSize - 1,
    };
  }

  const start = Number.parseInt(startRaw, 10);
  if (!Number.isFinite(start) || start < 0) return { kind: 'invalid' };
  if (start >= fileSize) return { kind: 'unsatisfiable' };

  if (!endRaw) {
    return { kind: 'valid', start, end: fileSize - 1 };
  }

  const end = Number.parseInt(endRaw, 10);
  if (!Number.isFinite(end) || end < 0) return { kind: 'invalid' };
  if (end < start) return { kind: 'invalid' };
  return {
    kind: 'valid',
    start,
    end: Math.min(end, fileSize - 1),
  };
};

export const fetchSeaweedObjectForClass = ({
  mediaClass,
  objectPath,
  method,
  rangeHeader,
}: {
  mediaClass: MediaClassKey;
  objectPath: string;
  method: S3FetchMethod;
  rangeHeader?: string | null;
}): Promise<MediaFetchResult> =>
  fetchSeaweedObject({
    objectPath,
    method,
    rangeHeader,
    bucket: resolveMediaBucketForClass(mediaClass),
    cacheControl: resolveMediaCacheControlForClass(mediaClass),
  });

const tryServeSeaweedClassResponse = async ({
  request,
  mediaClass,
  relativePath,
  method,
  downloadRequested,
}: {
  request: NextRequest;
  mediaClass: MediaClassKey;
  relativePath: string;
  method: MediaRequestMethod;
  downloadRequested: boolean;
}): Promise<NextResponse | null> => {
  if (!isSeaweedProviderEnabled()) return null;

  const upstream = await fetchSeaweedObjectForClass({
    mediaClass,
    objectPath: relativePath,
    method,
    rangeHeader: method === 'GET' ? request.headers.get('range') : null,
  });
  if (!upstream.response) return null;

  return withCorsDownloadResponse({
    request,
    response: upstream.response,
    relativePath,
    downloadRequested,
  });
};

const tryServeLocalFileResponse = async ({
  request,
  relativePath,
  downloadRelativePath,
  method,
  downloadRequested,
  roots,
  cacheControl,
  resolveContentType,
}: {
  request: NextRequest;
  relativePath: string;
  downloadRelativePath?: string;
  method: MediaRequestMethod;
  downloadRequested: boolean;
  roots: readonly string[];
  cacheControl: string;
  resolveContentType: (filePath: string) => string;
}): Promise<NextResponse | null> => {
  const filePath = findLocalFile({ relativePath, roots });
  if (!filePath) return null;

  const response = await buildLocalFileResponse({
    request,
    filePath,
    method,
    cacheControl,
    resolveContentType,
  });
  return withCorsDownloadResponse({
    request,
    response,
    relativePath: downloadRelativePath ?? relativePath,
    downloadRequested,
  });
};

export const tryServeLocalClassResponse = async ({
  request,
  mediaClass,
  relativePath,
  downloadRelativePath,
  method,
  downloadRequested,
}: {
  request: NextRequest;
  mediaClass: MediaClassKey;
  relativePath: string;
  downloadRelativePath?: string;
  method: MediaRequestMethod;
  downloadRequested: boolean;
}): Promise<NextResponse | null> => {
  const roots = resolveMediaLocalRoots(mediaClass);
  const cacheControl = resolveMediaCacheControlForClass(mediaClass);
  const resolveContentType = (filePath: string): string => {
    const extension = path.extname(filePath).toLowerCase();
    return MEDIA_CONTENT_TYPE_MAPS[mediaClass][extension] ?? 'application/octet-stream';
  };
  return tryServeLocalFileResponse({
    request,
    relativePath,
    downloadRelativePath,
    method,
    downloadRequested,
    roots,
    cacheControl,
    resolveContentType,
  });
};

export const tryServeSeaweedThenLocalClassResponse = async ({
  request,
  mediaClass,
  relativePath,
  method,
  downloadRequested,
}: {
  request: NextRequest;
  mediaClass: MediaClassKey;
  relativePath: string;
  method: MediaRequestMethod;
  downloadRequested: boolean;
}): Promise<NextResponse | null> => {
  const seaweedResponse = await tryServeSeaweedClassResponse({
    request,
    mediaClass,
    relativePath,
    method,
    downloadRequested,
  });
  if (seaweedResponse) {
    seaweedResponse.headers.set(MEDIA_RESPONSE_SOURCE_HEADER, 'seaweed');
    return seaweedResponse;
  }

  if (!isLocalReadFallbackEnabledForClass(mediaClass)) {
    return null;
  }

  const localResponse = await tryServeLocalClassResponse({
    request,
    mediaClass,
    relativePath,
    method,
    downloadRequested,
  });
  if (localResponse) {
    localResponse.headers.set(MEDIA_RESPONSE_SOURCE_HEADER, 'local-fallback');
    if (shouldLogLocalFallbackReads()) {
      console.warn('[media-file-route] served local fallback media response', {
        mediaClass,
        method,
        relativePath,
      });
    }
  }
  return localResponse;
};

const buildLocalFileResponse = async ({
  request,
  filePath,
  method,
  cacheControl,
  resolveContentType,
}: {
  request: NextRequest;
  filePath: string;
  method: MediaRequestMethod;
  cacheControl: string;
  resolveContentType: (filePath: string) => string;
}): Promise<NextResponse> => {
  const stats = await fs.promises.stat(filePath);
  const size = stats.size;
  const contentType = resolveContentType(filePath);
  const range = method === 'GET'
    ? parseSingleByteRange(request.headers.get('range'), size)
    : { kind: 'none' as const };

  if (method === 'HEAD') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(size),
      },
    });
  }

  if (range.kind === 'invalid' || range.kind === 'unsatisfiable') {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${size}`,
      },
    });
  }

  const fileBuffer = await fs.promises.readFile(filePath);
  if (range.kind === 'valid') {
    const chunk = fileBuffer.subarray(range.start, range.end + 1);
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(chunk.length),
      },
    });
  }

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileBuffer.length),
    },
  });
};

const buildMissingImageSvgFallbackResponse = ({
  svg,
  fallbackKey,
  method,
}: {
  svg: string;
  fallbackKey: string;
  method: MediaRequestMethod;
}): NextResponse => {
  const headers = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Content-Length': String(Buffer.byteLength(svg, 'utf8')),
    'X-Astral-Media-Fallback': fallbackKey,
  };

  if (method === 'HEAD') return new NextResponse(null, { status: 200, headers });

  return new NextResponse(svg, { status: 200, headers });
};

const withCors = (request: NextRequest, response: NextResponse): NextResponse => {
  const origin =
    request.headers.get('origin') ??
    process.env.FRONTEND_ORIGIN ??
    process.env.PAYLOAD_PUBLIC_SERVER_URL ??
    'https://astralpirates.com';

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.append('Vary', 'Origin');
  return response;
};

const isDownloadRequested = (
  request: NextRequest,
  queryKey = 'download',
): boolean => {
  const raw = request.nextUrl?.searchParams?.get?.(queryKey) ?? null;
  if (typeof raw !== 'string') return false;
  return DOWNLOAD_QUERY_ALLOW_VALUES.has(raw.trim().toLowerCase());
};

export const isImageFallbackRequested = (
  searchParams?: URLSearchParams | null,
): boolean =>
  isMissingMediaImageFallbackMode(resolveMissingMediaFallbackMode(searchParams));

const normalizeRelativeMediaPath = (value: string): string | null => {
  const relativePath = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relativePath || relativePath.includes('..')) return null;
  return relativePath;
};

const resolveRelativePathFromParams = async (
  context: MediaSlugParamsContext,
): Promise<string | null> => {
  const params = await context.params;
  return normalizeRelativeMediaPath((params.slug ?? []).join('/'));
};

export const resolveMediaRequestState = async ({
  request,
  context,
}: {
  request: NextRequest;
  context: MediaSlugParamsContext;
}): Promise<{ relativePath: string | null; downloadRequested: boolean }> => ({
  relativePath: await resolveRelativePathFromParams(context),
  downloadRequested: isDownloadRequested(request),
});

const decodePathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const resolveDownloadFilename = (relativePath: string): string => {
  const basename = relativePath.split('/').filter((segment) => segment.length > 0).pop() ?? 'media';
  const decoded = decodePathSegment(basename);
  const sanitized = decoded.replace(/["\\\r\n]/g, '_').trim();
  return sanitized.length > 0 ? sanitized : 'media';
};

const withDownloadDisposition = ({
  response,
  relativePath,
  downloadRequested,
}: {
  response: NextResponse;
  relativePath: string;
  downloadRequested: boolean;
}): NextResponse => {
  if (!downloadRequested) return response;
  const filename = resolveDownloadFilename(relativePath);
  response.headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  return response;
};

export const withCorsDownloadResponse = ({
  request,
  response,
  relativePath,
  downloadRequested,
}: {
  request: NextRequest;
  response: NextResponse;
  relativePath: string;
  downloadRequested: boolean;
}): NextResponse =>
  withCors(
    request,
    withDownloadDisposition({
      response,
      relativePath,
      downloadRequested,
    }),
  );

export const withMissingImageFallbackDownloadResponse = ({
  request,
  mediaClass,
  method,
  relativePath,
  downloadRequested,
}: {
  request: NextRequest;
  mediaClass: MissingImageClassKey;
  method: MediaRequestMethod;
  relativePath: string;
  downloadRequested: boolean;
}): NextResponse =>
  withCorsDownloadResponse({
    request,
    response: buildMissingImageSvgFallbackResponse({
      svg: MISSING_IMAGE_SVG_TEMPLATES[mediaClass],
      fallbackKey: MISSING_IMAGE_FALLBACK_KEYS[mediaClass],
      method,
    }),
    relativePath,
    downloadRequested,
  });

const withCorsJsonError = ({
  request,
  error,
  status,
}: {
  request: NextRequest;
  error: string;
  status: number;
}): NextResponse => withCors(request, NextResponse.json({ error }, { status }));

export const withCorsNotFoundError = ({
  request,
  error,
}: {
  request: NextRequest;
  error: string;
}): NextResponse => withCorsJsonError({ request, error, status: 404 });

export const withCorsErrorForMethod = ({
  request,
  method,
  status,
  error,
}: {
  request: NextRequest;
  method: MediaRequestMethod;
  status: number;
  error: string;
}): NextResponse => {
  if (method === 'HEAD') return withCors(request, new NextResponse(null, { status }));
  return withCorsJsonError({ request, error, status });
};

export const createMediaMethodHandlers = <TContext>(
  handler: (args: MediaMethodHandlerArgs<TContext>) => Promise<NextResponse>,
): {
  GET: (request: NextRequest, context: TContext) => Promise<NextResponse>;
  HEAD: (request: NextRequest, context: TContext) => Promise<NextResponse>;
} => ({
  GET: (request: NextRequest, context: TContext) =>
    handler({
      request,
      context,
      method: 'GET',
    }),
  HEAD: (request: NextRequest, context: TContext) =>
    handler({
      request,
      context,
      method: 'HEAD',
    }),
});
