import { createHmac, createHash } from 'node:crypto';
import {
  MEDIA_DEFAULT_BUCKETS,
  shouldTreatHostnameAsInternalMedia,
  resolveMediaBucketName,
} from '@astralpirates/shared/mediaUrls';

type MediaClassKey = 'avatars' | 'gallery' | 'tasks' | 'badges';
type S3Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

const PRIVATE_DELIVERY_MODES = new Set(['proxy', 'signed-redirect']);
const AWS_ALGORITHM = 'AWS4-HMAC-SHA256';
const S3_SERVICE = 's3';

const MEDIA_BUCKET_ENV_KEYS: Record<MediaClassKey, string> = {
  avatars: 'MEDIA_BUCKET_AVATARS',
  gallery: 'MEDIA_BUCKET_GALLERY',
  tasks: 'MEDIA_BUCKET_TASKS',
  badges: 'MEDIA_BUCKET_BADGES',
};

const trimValue = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

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

const toHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const resolvePrivateDeliveryMode = (): 'proxy' | 'signed-redirect' => {
  const normalized = sanitizeEnvValue(process.env.MEDIA_PRIVATE_DELIVERY_MODE).toLowerCase();
  if (!PRIVATE_DELIVERY_MODES.has(normalized)) return 'proxy';
  return normalized as 'proxy' | 'signed-redirect';
};

const resolveRedirectEndpoint = (): string | null => {
  const preferred = sanitizeEnvValue(process.env.MEDIA_PRIVATE_REDIRECT_BASE_URL);
  const fallback =
    sanitizeEnvValue(process.env.MEDIA_S3_PUBLIC_ENDPOINT) ||
    sanitizeEnvValue(process.env.MEDIA_S3_ENDPOINT) ||
    sanitizeEnvValue(process.env.MEDIA_BASE_URL);
  const candidate = preferred || fallback;
  if (!candidate) return null;

  try {
    const endpoint = normalizeEndpoint(candidate);
    const parsed = new URL(endpoint);
    const hostname = parsed.hostname.toLowerCase();
    if (shouldTreatHostnameAsInternalMedia(hostname)) return null;
    return endpoint;
  } catch {
    return null;
  }
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

const resolveTtlSeconds = (): number => {
  const parsed = Number.parseInt(
    sanitizeEnvValue(process.env.MEDIA_SIGNED_URL_TTL_SECONDS),
    10,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) return 300;
  return Math.min(parsed, 3600);
};

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

const buildCanonicalQueryString = (params: URLSearchParams): string => {
  const entries = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });
  return entries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
};

const resolveMediaBucketForClass = (mediaClass: MediaClassKey): string => {
  const envKey = MEDIA_BUCKET_ENV_KEYS[mediaClass];
  return resolveMediaBucketName(process.env[envKey], MEDIA_DEFAULT_BUCKETS[mediaClass]);
};

const sanitizeDownloadFilename = (value: string): string =>
  value.replace(/["\\\r\n]/g, '_').trim() || 'media';

export const resolveSignedRedirectUrlForMedia = ({
  mediaClass,
  objectPath,
  downloadFilename,
}: {
  mediaClass: MediaClassKey;
  objectPath: string;
  downloadFilename?: string | null;
}): string | null => {
  if (resolvePrivateDeliveryMode() !== 'signed-redirect') return null;
  if ((process.env.MEDIA_STORAGE_PROVIDER ?? 'local').trim().toLowerCase() !== 'seaweedfs') {
    return null;
  }

  const endpoint = resolveRedirectEndpoint();
  const credentials = resolveS3Credentials();
  if (!endpoint || !credentials) return null;

  const safePath = objectPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!safePath || safePath.includes('..')) return null;
  const encodedObjectPath = safePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const bucket = resolveMediaBucketForClass(mediaClass);
  const targetUrl = new URL(`${endpoint}/${bucket}/${encodedObjectPath}`);
  const host = toHostname(targetUrl.toString());
  if (!host || shouldTreatHostnameAsInternalMedia(host)) {
    return null;
  }

  const expiresInSeconds = resolveTtlSeconds();
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${credentials.region}/${S3_SERVICE}/aws4_request`;

  const query = new URLSearchParams(targetUrl.search);
  query.set('X-Amz-Algorithm', AWS_ALGORITHM);
  query.set(
    'X-Amz-Credential',
    `${credentials.accessKeyId}/${credentialScope}`,
  );
  query.set('X-Amz-Date', amzDate);
  query.set('X-Amz-Expires', String(expiresInSeconds));
  query.set('X-Amz-SignedHeaders', 'host');
  if (downloadFilename) {
    query.set(
      'response-content-disposition',
      `attachment; filename="${sanitizeDownloadFilename(downloadFilename)}"`,
    );
  }

  const canonicalRequest =
    `GET\n${buildCanonicalUri(targetUrl.pathname)}\n${buildCanonicalQueryString(query)}\n` +
    `host:${targetUrl.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign =
    `${AWS_ALGORITHM}\n${amzDate}\n${credentialScope}\n${hashSha256Hex(canonicalRequest)}`;

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
  query.set('X-Amz-Signature', signature);

  targetUrl.search = query.toString();
  return targetUrl.toString();
};
