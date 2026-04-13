process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { Payload } from 'payload';
import { resolveMediaLocalRoots } from '@/app/api/_lib/mediaFileRoute';
import {
  resolveScriptRunProfile,
  runDatabasePreflight,
} from '@/src/scripts/_lib/dbPreflight.ts';
import {
  MEDIA_DEFAULT_BUCKETS,
  resolveMediaBucketName,
} from '@astralpirates/shared/mediaUrls';

type MediaClass = 'avatars' | 'gallery' | 'tasks' | 'badges';
type CollectionSlug = 'avatars' | 'gallery-images' | 'task-attachments' | 'honor-badge-media';
type HttpMethod = 'GET' | 'PUT';
type VerificationMode = 'db-and-storage' | 'storage-only';

type Options = {
  apply: boolean;
  overwriteMismatch: boolean;
  skipDb: boolean;
  strict: boolean;
  outputJson: string;
  outputMd: string | null;
  timeoutMs: number;
  classes: MediaClass[];
};

type S3Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

type MediaClassConfig = {
  mediaClass: MediaClass;
  bucket: string;
  roots: readonly string[];
  collection: CollectionSlug;
};

type LocalFileRecord = {
  mediaClass: MediaClass;
  objectKey: string;
  absolutePath: string;
  sourceRoot: string;
  sizeBytes: number;
};

type DestinationProbeResult =
  | {
      state: 'ok';
      hashSha256: string;
      sizeBytes: number;
      status: number;
      attempts: string[];
    }
  | {
      state: 'missing';
      attempts: string[];
    }
  | {
      state: 'error';
      attempts: string[];
      reason: string;
    };

type UploadResult =
  | {
      ok: true;
      status: number;
      attempts: string[];
    }
  | {
      ok: false;
      attempts: string[];
      reason: string;
    };

type FileStatus =
  | 'already_synced'
  | 'missing_destination'
  | 'copied'
  | 'overwritten'
  | 'mismatch_skipped'
  | 'error';

type FileManifestEntry = {
  mediaClass: MediaClass;
  bucket: string;
  objectKey: string;
  sourcePath: string;
  sourceSizeBytes: number;
  sourceSha256: string;
  destinationSha256: string | null;
  destinationSizeBytes: number | null;
  status: FileStatus;
  attempts: string[];
  note: string | null;
};

type ReferenceCheckEntry = {
  mediaClass: MediaClass;
  objectKey: string;
  hasLocalSource: boolean;
  destinationExists: boolean;
  destinationSha256: string | null;
  status: 'ok' | 'missing_destination' | 'probe_error';
  attempts: string[];
  note: string | null;
};

type ClassSummary = {
  localFiles: number;
  referencedObjects: number;
  alreadySynced: number;
  missingDestination: number;
  copied: number;
  overwritten: number;
  mismatchSkipped: number;
  errors: number;
};

type Manifest = {
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  verificationMode: VerificationMode;
  overwriteMismatch: boolean;
  strict: boolean;
  timeoutMs: number;
  endpointCandidates: string[];
  authMode: 'signed' | 'unsigned';
  classes: Record<MediaClass, {
    bucket: string;
    roots: readonly string[];
    summary: ClassSummary;
  }>;
  files: FileManifestEntry[];
  references: ReferenceCheckEntry[];
  totals: {
    localFiles: number;
    referencedObjects: number;
    alreadySynced: number;
    missingDestination: number;
    copied: number;
    overwritten: number;
    mismatchSkipped: number;
    errors: number;
    referenceMissingDestination: number;
    referenceProbeErrors: number;
  };
};

const DEFAULT_OUTPUT_JSON = path.resolve(
  process.cwd(),
  'tmp/seaweed-media-backfill-manifest.json',
);
const DEFAULT_TIMEOUT_MS = 25_000;
const PAGE_SIZE = 200;
const AWS_ALGORITHM = 'AWS4-HMAC-SHA256';
const S3_SERVICE = 's3';

const MEDIA_CLASS_ORDER: MediaClass[] = ['avatars', 'gallery', 'tasks', 'badges'];

const MEDIA_CLASS_TO_COLLECTION: Record<MediaClass, CollectionSlug> = {
  avatars: 'avatars',
  gallery: 'gallery-images',
  tasks: 'task-attachments',
  badges: 'honor-badge-media',
};

const MEDIA_CLASS_TO_BUCKET: Record<MediaClass, string> = {
  avatars: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_AVATARS,
    MEDIA_DEFAULT_BUCKETS.avatars,
  ),
  gallery: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_GALLERY,
    MEDIA_DEFAULT_BUCKETS.gallery,
  ),
  tasks: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_TASKS,
    MEDIA_DEFAULT_BUCKETS.tasks,
  ),
  badges: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_BADGES,
    MEDIA_DEFAULT_BUCKETS.badges,
  ),
};

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.md': 'text/markdown; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.obj': 'model/obj',
  '.oga': 'audio/ogg',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.stl': 'model/stl',
  '.txt': 'text/plain; charset=utf-8',
  '.usdz': 'model/vnd.usdz+zip',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

const usage = (): void => {
  // eslint-disable-next-line no-console
  console.log(`Usage: pnpm --dir cms exec tsx ./src/scripts/backfillSeaweedMedia.ts [options]

Backfills local media files into SeaweedFS buckets and verifies SHA256 parity.

Options:
  --apply                   Upload missing objects (dry-run by default)
  --overwrite-mismatch      Overwrite destination objects when checksum differs
  --skip-db                 Skip Payload DB reference verification pass
  --strict                  Exit non-zero when referenced objects are missing
  --output-json <path>      JSON manifest output path (default: ${DEFAULT_OUTPUT_JSON})
  --output-md <path>        Optional markdown summary output path
  --timeout-ms <n>          Per-request timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --classes <csv>           Comma-separated subset: avatars,gallery,tasks,badges
  -h, --help                Show help
`);
};

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeEnvValue = (value: string | undefined): string => {
  const trimmed = trim(value);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const normalizeEndpoint = (value: string): string => value.replace(/\/+$/, '');

const normalizeObjectKey = (value: string): string =>
  value
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();

const decodeSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const MIME_LIKE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

const KNOWN_REFERENCE_KEYS = new Set([
  'filename',
  'href',
  'path',
  'src',
  'url',
]);

const isMimeLikeValue = (value: string): boolean => MIME_LIKE_PATTERN.test(value);

const isLikelyObjectReferenceValue = (value: string): boolean => {
  const normalized = trim(value);
  if (!normalized) return false;
  if (normalized.startsWith('data:')) return false;
  if (isMimeLikeValue(normalized)) return false;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (normalized.includes('/')) return true;
  return normalized.includes('.');
};

const addObjectKeyCandidate = (output: Set<string>, value: string): void => {
  const normalized = normalizeObjectKey(value);
  if (!normalized) return;
  output.add(normalized);

  const decoded = normalizeObjectKey(decodeSafe(normalized));
  if (decoded) output.add(decoded);

  const plusDecoded = normalizeObjectKey(decoded.replace(/\+/g, ' '));
  if (plusDecoded) output.add(plusDecoded);

  const tail = normalizeObjectKey(plusDecoded.split('/').slice(1).join('/'));
  if (tail && tail !== plusDecoded) output.add(tail);

  const basename = normalizeObjectKey(path.posix.basename(plusDecoded));
  if (basename) output.add(basename);

  const prefixStrippedPatterns = [
    /^api\/avatars\/file\/(.+)$/i,
    /^api\/gallery-images\/file\/(.+)$/i,
    /^api\/task-attachments\/file\/(.+)$/i,
    /^api\/honor-badge-media\/file\/(.+)$/i,
    /^media\/avatars\/(.+)$/i,
    /^media\/gallery\/(.+)$/i,
    /^media\/tasks\/(.+)$/i,
    /^media\/badges\/(.+)$/i,
    /^s3\/avatars\/(.+)$/i,
    /^s3\/gallery\/(.+)$/i,
    /^s3\/tasks\/(.+)$/i,
    /^s3\/badges\/(.+)$/i,
    /^avatars\/(.+)$/i,
    /^gallery\/(.+)$/i,
    /^tasks\/(.+)$/i,
    /^badges\/(.+)$/i,
  ];

  for (const pattern of prefixStrippedPatterns) {
    const match = plusDecoded.match(pattern);
    const stripped = normalizeObjectKey(match?.[1] ?? '');
    if (stripped) output.add(stripped);
  }
};

const resolveObjectKeyCandidates = (value: string): string[] => {
  const normalizedInput = trim(value);
  if (!isLikelyObjectReferenceValue(normalizedInput)) return [];

  const candidates = new Set<string>();

  if (/^https?:\/\//i.test(normalizedInput)) {
    try {
      const parsed = new URL(normalizedInput);
      addObjectKeyCandidate(candidates, parsed.pathname);
    } catch {
      addObjectKeyCandidate(candidates, normalizedInput);
    }
  } else {
    addObjectKeyCandidate(candidates, normalizedInput);
  }

  return Array.from(candidates.values()).filter((entry) => entry.length > 0);
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseClasses = (value: string | undefined): MediaClass[] => {
  const raw = trim(value);
  if (!raw) return [...MEDIA_CLASS_ORDER];
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const classes = Array.from(new Set(parsed));
  const invalid = classes.filter(
    (entry) => !MEDIA_CLASS_ORDER.includes(entry as MediaClass),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid --classes value "${raw}". Unknown class(es): ${invalid.join(', ')}.`,
    );
  }
  const valid = classes.filter(
    (entry): entry is MediaClass => MEDIA_CLASS_ORDER.includes(entry as MediaClass),
  );
  return valid;
};

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  let apply = false;
  let overwriteMismatch = false;
  let skipDb = false;
  let strict = false;
  let outputJson = DEFAULT_OUTPUT_JSON;
  let outputMd: string | null = null;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let classes = [...MEDIA_CLASS_ORDER];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--overwrite-mismatch') {
      overwriteMismatch = true;
      continue;
    }
    if (arg === '--skip-db') {
      skipDb = true;
      continue;
    }
    if (arg === '--strict') {
      strict = true;
      continue;
    }
    if (arg === '--output-json' && typeof next === 'string') {
      outputJson = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (arg === '--output-md' && typeof next === 'string') {
      outputMd = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms' && typeof next === 'string') {
      timeoutMs = parsePositiveInt(next, DEFAULT_TIMEOUT_MS);
      i += 1;
      continue;
    }
    if (arg === '--classes' && typeof next === 'string') {
      classes = parseClasses(next);
      i += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (overwriteMismatch && !apply) {
    throw new Error('--overwrite-mismatch requires --apply.');
  }

  return {
    apply,
    overwriteMismatch,
    skipDb,
    strict,
    outputJson,
    outputMd,
    timeoutMs,
    classes,
  };
};

const listRelativeFiles = (root: string): string[] => {
  if (!fs.existsSync(root)) return [];

  const stack = [root];
  const result: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;

      const relative = normalizeObjectKey(
        path.relative(root, absolute).split(path.sep).join('/'),
      );
      if (!relative) continue;
      result.push(relative);
    }
  }

  result.sort((a, b) => a.localeCompare(b));
  return result;
};

const resolveMediaClassConfigs = (classes: MediaClass[]): MediaClassConfig[] =>
  classes.map((mediaClass) => ({
    mediaClass,
    bucket: MEDIA_CLASS_TO_BUCKET[mediaClass],
    roots: resolveMediaLocalRoots(mediaClass),
    collection: MEDIA_CLASS_TO_COLLECTION[mediaClass],
  }));

const collectLocalFiles = ({
  classConfig,
}: {
  classConfig: MediaClassConfig;
}): { files: LocalFileRecord[]; warnings: string[] } => {
  const keyed = new Map<string, LocalFileRecord>();
  const warnings: string[] = [];

  for (const root of classConfig.roots) {
    const relativePaths = listRelativeFiles(root);
    for (const relativePath of relativePaths) {
      const absolutePath = path.join(root, relativePath);
      let stats: fs.Stats;
      try {
        stats = fs.statSync(absolutePath);
      } catch {
        continue;
      }

      if (!stats.isFile()) continue;
      if (keyed.has(relativePath)) {
        const existing = keyed.get(relativePath);
        warnings.push(
          `[backfill-seaweed-media] duplicate local key ${classConfig.mediaClass}/${relativePath} at ${absolutePath}; using first source ${existing?.absolutePath ?? 'unknown'}.`,
        );
        continue;
      }

      keyed.set(relativePath, {
        mediaClass: classConfig.mediaClass,
        objectKey: relativePath,
        absolutePath,
        sourceRoot: root,
        sizeBytes: stats.size,
      });
    }
  }

  const files = Array.from(keyed.values()).sort((a, b) =>
    a.objectKey.localeCompare(b.objectKey),
  );
  return { files, warnings };
};

const sha256Hex = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex');

const hashSha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const hmacSha256 = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value).digest();

const hmacSha256Hex = (key: Buffer | string, value: string): string =>
  createHmac('sha256', key).update(value).digest('hex');

const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const toAmzDate = (value: Date): string =>
  value.toISOString().replace(/[:-]|\.\d{3}/g, '');

const buildCanonicalUri = (pathnameValue: string): string => {
  const normalized =
    pathnameValue && pathnameValue.startsWith('/')
      ? pathnameValue
      : `/${pathnameValue || ''}`;
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
  const queryEntries = Array.from(url.searchParams.entries()).sort(
    ([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) return aValue.localeCompare(bValue);
      return aKey.localeCompare(bKey);
    },
  );

  return queryEntries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
};

const resolveCredentials = (): S3Credentials | null => {
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

const resolveEndpointCandidates = (): string[] => {
  const internalEndpoint = sanitizeEnvValue(process.env.MEDIA_S3_INTERNAL_ENDPOINT);
  const endpoint = sanitizeEnvValue(process.env.MEDIA_S3_ENDPOINT);
  const defaults = ['http://127.0.0.1:8333', 'http://localhost:8333'];
  const ordered = [internalEndpoint, endpoint, ...defaults]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map(normalizeEndpoint);

  return Array.from(new Set(ordered));
};

const buildSignedHeaders = ({
  method,
  target,
  credentials,
  contentSha256,
}: {
  method: HttpMethod;
  target: URL;
  credentials: S3Credentials;
  contentSha256: string;
}): Headers => {
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${credentials.region}/${S3_SERVICE}/aws4_request`;

  const canonicalUri = buildCanonicalUri(target.pathname);
  const canonicalQuery = buildCanonicalQueryString(target);
  const canonicalHeaders =
    `host:${target.host}\n` +
    `x-amz-content-sha256:${contentSha256}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest =
    `${method}\n${canonicalUri}\n${canonicalQuery}\n` +
    `${canonicalHeaders}\n${signedHeaders}\n${contentSha256}`;
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

  return new Headers({
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': contentSha256,
  });
};

const withTimeout = async <T>({
  timeoutMs,
  run,
}: {
  timeoutMs: number;
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const encodeObjectKey = (objectKey: string): string =>
  normalizeObjectKey(objectKey)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const buildTargetUrl = ({
  endpoint,
  bucket,
  objectKey,
}: {
  endpoint: string;
  bucket: string;
  objectKey: string;
}): URL => new URL(`${normalizeEndpoint(endpoint)}/${bucket}/${encodeObjectKey(objectKey)}`);

const probeDestinationObject = async ({
  endpointCandidates,
  credentials,
  timeoutMs,
  bucket,
  objectKey,
}: {
  endpointCandidates: string[];
  credentials: S3Credentials | null;
  timeoutMs: number;
  bucket: string;
  objectKey: string;
}): Promise<DestinationProbeResult> => {
  const attempts: string[] = [];
  let sawNotFound = false;

  for (const endpoint of endpointCandidates) {
    try {
      const target = buildTargetUrl({ endpoint, bucket, objectKey });
      const emptyHash =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const headers = credentials
        ? buildSignedHeaders({
            method: 'GET',
            target,
            credentials,
            contentSha256: emptyHash,
          })
        : new Headers();

      const response = await withTimeout({
        timeoutMs,
        run: (signal) =>
          fetch(target, {
            method: 'GET',
            headers,
            signal,
          }),
      });
      attempts.push(`${credentials ? 'signed' : 'unsigned'}:${endpoint}:${response.status}`);

      if (response.status === 404) {
        sawNotFound = true;
        continue;
      }
      if (!response.ok) {
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        state: 'ok',
        hashSha256: sha256Hex(bytes),
        sizeBytes: bytes.length,
        status: response.status,
        attempts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push(`${credentials ? 'signed' : 'unsigned'}:${endpoint}:error:${message}`);
    }
  }

  if (sawNotFound) {
    return {
      state: 'missing',
      attempts,
    };
  }

  return {
    state: 'error',
    attempts,
    reason:
      attempts.length > 0
        ? 'Destination probe failed for all endpoints.'
        : 'No endpoint candidates configured.',
  };
};

const uploadDestinationObject = async ({
  endpointCandidates,
  credentials,
  timeoutMs,
  bucket,
  objectKey,
  body,
  contentType,
}: {
  endpointCandidates: string[];
  credentials: S3Credentials | null;
  timeoutMs: number;
  bucket: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
}): Promise<UploadResult> => {
  const attempts: string[] = [];
  const payloadHash = sha256Hex(body);

  for (const endpoint of endpointCandidates) {
    try {
      const target = buildTargetUrl({ endpoint, bucket, objectKey });
      const headers = credentials
        ? buildSignedHeaders({
            method: 'PUT',
            target,
            credentials,
            contentSha256: payloadHash,
          })
        : new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Content-Length', String(body.length));

      const response = await withTimeout({
        timeoutMs,
        run: (signal) =>
          fetch(target, {
            method: 'PUT',
            headers,
            body,
            signal,
          }),
      });
      attempts.push(`${credentials ? 'signed' : 'unsigned'}:${endpoint}:${response.status}`);

      if (!response.ok) continue;

      return {
        ok: true,
        status: response.status,
        attempts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push(`${credentials ? 'signed' : 'unsigned'}:${endpoint}:error:${message}`);
    }
  }

  return {
    ok: false,
    attempts,
    reason:
      attempts.length > 0
        ? 'Upload failed for all endpoints.'
        : 'No endpoint candidates configured.',
  };
};

const inferContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext] ?? 'application/octet-stream';
};

const collectNestedFilenameValues = (
  value: unknown,
  output: Set<string>,
  keyHint: string | null = null,
): void => {
  if (!value) return;

  if (typeof value === 'string') {
    const key = keyHint?.trim().toLowerCase() ?? '';
    if (KNOWN_REFERENCE_KEYS.has(key) || isLikelyObjectReferenceValue(value)) {
      resolveObjectKeyCandidates(value).forEach((candidate) => output.add(candidate));
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectNestedFilenameValues(entry, output, keyHint));
    return;
  }

  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    collectNestedFilenameValues(nested, output, key);
  }
};

const collectReferencedObjectKeys = async ({
  payloadInstance,
  classConfig,
}: {
  payloadInstance: Payload;
  classConfig: MediaClassConfig;
}): Promise<Set<string>> => {
  const referenced = new Set<string>();
  let page = 1;

  while (true) {
    const result = await payloadInstance.find({
      collection: classConfig.collection,
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
      select: {
        id: true,
        filename: true,
        sizes: true,
      },
    });

    if (!result.docs.length) break;

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      if (typeof doc.filename === 'string') {
        resolveObjectKeyCandidates(doc.filename).forEach((candidate) =>
          referenced.add(candidate),
        );
      }
      collectNestedFilenameValues(doc.sizes, referenced);
    }

    if (page >= result.totalPages) break;
    page += 1;
  }

  return referenced;
};

const ensureParentDir = async (filePath: string): Promise<void> => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
};

const toMarkdown = (manifest: Manifest): string => {
  const lines: string[] = [];
  lines.push('# SeaweedFS media backfill report');
  lines.push('');
  lines.push(`- generatedAt: ${manifest.generatedAt}`);
  lines.push(`- mode: ${manifest.mode}`);
  lines.push(`- verificationMode: ${manifest.verificationMode}`);
  lines.push(`- overwriteMismatch: ${String(manifest.overwriteMismatch)}`);
  lines.push(`- strict: ${String(manifest.strict)}`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- localFiles: ${manifest.totals.localFiles}`);
  lines.push(`- referencedObjects: ${manifest.totals.referencedObjects}`);
  lines.push(`- alreadySynced: ${manifest.totals.alreadySynced}`);
  lines.push(`- missingDestination: ${manifest.totals.missingDestination}`);
  lines.push(`- copied: ${manifest.totals.copied}`);
  lines.push(`- overwritten: ${manifest.totals.overwritten}`);
  lines.push(`- mismatchSkipped: ${manifest.totals.mismatchSkipped}`);
  lines.push(`- errors: ${manifest.totals.errors}`);
  lines.push(`- referenceMissingDestination: ${manifest.totals.referenceMissingDestination}`);
  lines.push(`- referenceProbeErrors: ${manifest.totals.referenceProbeErrors}`);
  lines.push('');
  lines.push('## Per Class');
  lines.push('');

  for (const mediaClass of MEDIA_CLASS_ORDER) {
    const classState = manifest.classes[mediaClass];
    const summary = classState.summary;
    lines.push(`### ${mediaClass}`);
    lines.push('');
    lines.push(`- bucket: ${classState.bucket}`);
    lines.push(`- roots: ${classState.roots.join(', ')}`);
    lines.push(`- localFiles: ${summary.localFiles}`);
    lines.push(`- referencedObjects: ${summary.referencedObjects}`);
    lines.push(`- alreadySynced: ${summary.alreadySynced}`);
    lines.push(`- missingDestination: ${summary.missingDestination}`);
    lines.push(`- copied: ${summary.copied}`);
    lines.push(`- overwritten: ${summary.overwritten}`);
    lines.push(`- mismatchSkipped: ${summary.mismatchSkipped}`);
    lines.push(`- errors: ${summary.errors}`);
    lines.push('');
  }

  return lines.join('\n');
};

const buildInitialSummary = (): ClassSummary => ({
  localFiles: 0,
  referencedObjects: 0,
  alreadySynced: 0,
  missingDestination: 0,
  copied: 0,
  overwritten: 0,
  mismatchSkipped: 0,
  errors: 0,
});

const incrementSummaryStatus = ({
  summary,
  status,
}: {
  summary: ClassSummary;
  status: FileStatus;
}) => {
  if (status === 'already_synced') summary.alreadySynced += 1;
  if (status === 'missing_destination') summary.missingDestination += 1;
  if (status === 'copied') summary.copied += 1;
  if (status === 'overwritten') summary.overwritten += 1;
  if (status === 'mismatch_skipped') summary.mismatchSkipped += 1;
  if (status === 'error') summary.errors += 1;
};

const isSeaweedProvider = (): boolean =>
  (process.env.MEDIA_STORAGE_PROVIDER ?? '').trim().toLowerCase() === 'seaweedfs';

const run = async (): Promise<void> => {
  const options = parseArgs();
  if (!isSeaweedProvider()) {
    throw new Error(
      `[backfill-seaweed-media] MEDIA_STORAGE_PROVIDER must be seaweedfs (received ${process.env.MEDIA_STORAGE_PROVIDER ?? 'unset'}).`,
    );
  }

  const endpointCandidates = resolveEndpointCandidates();
  if (!endpointCandidates.length) {
    throw new Error('[backfill-seaweed-media] no Seaweed endpoint candidates configured.');
  }
  const credentials = resolveCredentials();
  const classConfigs = resolveMediaClassConfigs(options.classes);

  const summaryByClass: Record<MediaClass, ClassSummary> = {
    avatars: buildInitialSummary(),
    gallery: buildInitialSummary(),
    tasks: buildInitialSummary(),
    badges: buildInitialSummary(),
  };
  const files: FileManifestEntry[] = [];
  const references: ReferenceCheckEntry[] = [];
  const localMapByClass: Record<MediaClass, Map<string, LocalFileRecord>> = {
    avatars: new Map(),
    gallery: new Map(),
    tasks: new Map(),
    badges: new Map(),
  };
  const destinationHashCache = new Map<string, DestinationProbeResult>();
  const logger = console;

  for (const classConfig of classConfigs) {
    const { files: localFiles, warnings } = collectLocalFiles({ classConfig });
    warnings.forEach((warning) => logger.warn(warning));
    summaryByClass[classConfig.mediaClass].localFiles = localFiles.length;

    for (const localFile of localFiles) {
      localMapByClass[classConfig.mediaClass].set(localFile.objectKey, localFile);
    }
  }

  const probeDestination = async ({
    mediaClass,
    bucket,
    objectKey,
  }: {
    mediaClass: MediaClass;
    bucket: string;
    objectKey: string;
  }): Promise<DestinationProbeResult> => {
    const cacheKey = `${mediaClass}:${objectKey}`;
    const cached = destinationHashCache.get(cacheKey);
    if (cached) return cached;

    const probe = await probeDestinationObject({
      endpointCandidates,
      credentials,
      timeoutMs: options.timeoutMs,
      bucket,
      objectKey,
    });
    destinationHashCache.set(cacheKey, probe);
    return probe;
  };

  const setProbeCache = ({
    mediaClass,
    objectKey,
    probe,
  }: {
    mediaClass: MediaClass;
    objectKey: string;
    probe: DestinationProbeResult;
  }) => {
    destinationHashCache.set(`${mediaClass}:${objectKey}`, probe);
  };

  for (const classConfig of classConfigs) {
    const classLocalFiles = Array.from(localMapByClass[classConfig.mediaClass].values()).sort(
      (a, b) => a.objectKey.localeCompare(b.objectKey),
    );

    for (const localFile of classLocalFiles) {
      const sourceBuffer = await fs.promises.readFile(localFile.absolutePath);
      const sourceSha256 = sha256Hex(sourceBuffer);
      const sourceSizeBytes = sourceBuffer.length;
      const destinationProbe = await probeDestination({
        mediaClass: classConfig.mediaClass,
        bucket: classConfig.bucket,
        objectKey: localFile.objectKey,
      });

      const buildEntry = ({
        status,
        destinationSha256,
        destinationSizeBytes,
        attempts,
        note,
      }: {
        status: FileStatus;
        destinationSha256: string | null;
        destinationSizeBytes: number | null;
        attempts: string[];
        note: string | null;
      }): FileManifestEntry => ({
        mediaClass: classConfig.mediaClass,
        bucket: classConfig.bucket,
        objectKey: localFile.objectKey,
        sourcePath: localFile.absolutePath,
        sourceSizeBytes,
        sourceSha256,
        destinationSha256,
        destinationSizeBytes,
        status,
        attempts,
        note,
      });

      if (destinationProbe.state === 'error') {
        const entry = buildEntry({
          status: 'error',
          destinationSha256: null,
          destinationSizeBytes: null,
          attempts: destinationProbe.attempts,
          note: destinationProbe.reason,
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      if (
        destinationProbe.state === 'ok' &&
        destinationProbe.hashSha256 === sourceSha256
      ) {
        const entry = buildEntry({
          status: 'already_synced',
          destinationSha256: destinationProbe.hashSha256,
          destinationSizeBytes: destinationProbe.sizeBytes,
          attempts: destinationProbe.attempts,
          note: null,
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      const hasMismatch =
        destinationProbe.state === 'ok' &&
        destinationProbe.hashSha256 !== sourceSha256;
      const missingDestination = destinationProbe.state === 'missing';

      if (!options.apply) {
        const status: FileStatus = hasMismatch
          ? 'mismatch_skipped'
          : 'missing_destination';
        const note = hasMismatch
          ? 'Destination object exists but checksum differs.'
          : 'Destination object not found.';
        const entry = buildEntry({
          status,
          destinationSha256:
            destinationProbe.state === 'ok'
              ? destinationProbe.hashSha256
              : null,
          destinationSizeBytes:
            destinationProbe.state === 'ok'
              ? destinationProbe.sizeBytes
              : null,
          attempts: destinationProbe.attempts,
          note,
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      if (hasMismatch && !options.overwriteMismatch) {
        const entry = buildEntry({
          status: 'mismatch_skipped',
          destinationSha256:
            destinationProbe.state === 'ok'
              ? destinationProbe.hashSha256
              : null,
          destinationSizeBytes:
            destinationProbe.state === 'ok'
              ? destinationProbe.sizeBytes
              : null,
          attempts: destinationProbe.attempts,
          note:
            'Destination checksum differs; rerun with --overwrite-mismatch to replace.',
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      const upload = await uploadDestinationObject({
        endpointCandidates,
        credentials,
        timeoutMs: options.timeoutMs,
        bucket: classConfig.bucket,
        objectKey: localFile.objectKey,
        body: sourceBuffer,
        contentType: inferContentType(localFile.objectKey),
      });

      if (!upload.ok) {
        const entry = buildEntry({
          status: 'error',
          destinationSha256:
            destinationProbe.state === 'ok'
              ? destinationProbe.hashSha256
              : null,
          destinationSizeBytes:
            destinationProbe.state === 'ok'
              ? destinationProbe.sizeBytes
              : null,
          attempts: upload.attempts,
          note: upload.reason,
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      const verifyProbe = await probeDestinationObject({
        endpointCandidates,
        credentials,
        timeoutMs: options.timeoutMs,
        bucket: classConfig.bucket,
        objectKey: localFile.objectKey,
      });
      setProbeCache({
        mediaClass: classConfig.mediaClass,
        objectKey: localFile.objectKey,
        probe: verifyProbe,
      });

      if (verifyProbe.state !== 'ok') {
        const entry = buildEntry({
          status: 'error',
          destinationSha256: null,
          destinationSizeBytes: null,
          attempts: [...upload.attempts, ...verifyProbe.attempts],
          note: 'Upload succeeded but destination verification probe failed.',
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      if (verifyProbe.hashSha256 !== sourceSha256) {
        const entry = buildEntry({
          status: 'error',
          destinationSha256: verifyProbe.hashSha256,
          destinationSizeBytes: verifyProbe.sizeBytes,
          attempts: [...upload.attempts, ...verifyProbe.attempts],
          note: 'Upload verification checksum mismatch.',
        });
        files.push(entry);
        incrementSummaryStatus({
          summary: summaryByClass[classConfig.mediaClass],
          status: entry.status,
        });
        continue;
      }

      const entry = buildEntry({
        status: missingDestination ? 'copied' : 'overwritten',
        destinationSha256: verifyProbe.hashSha256,
        destinationSizeBytes: verifyProbe.sizeBytes,
        attempts: [...upload.attempts, ...verifyProbe.attempts],
        note: null,
      });
      files.push(entry);
      incrementSummaryStatus({
        summary: summaryByClass[classConfig.mediaClass],
        status: entry.status,
      });
    }
  }

  let payloadInstance: Payload | null = null;
  if (!options.skipDb) {
    const runProfile = resolveScriptRunProfile();
    process.env.NODE_ENV =
      process.env.NODE_ENV ??
      (runProfile === 'prod' ? 'production' : 'development');

    const preflight = await runDatabasePreflight({
      runProfile,
      scriptName: 'seaweed-media-backfill',
      requiredTables: ['avatars', 'gallery_images', 'task_attachments'],
    });
    preflight.warnings.forEach((warning) => logger.warn(warning));
    logger.info(
      `[backfill-seaweed-media] DB target ${preflight.target.host}:${preflight.target.port}/${preflight.target.database} (profile=${preflight.runProfile}, runtime=${preflight.runtime})`,
    );
    const [{ default: payload }, { default: payloadConfig }] = await Promise.all([
      import('payload'),
      import('@/payload.config.ts'),
    ]);
    payloadInstance = await payload.init({ config: payloadConfig });
  }

  if (payloadInstance) {
    for (const classConfig of classConfigs) {
      const referencedKeys = await collectReferencedObjectKeys({
        payloadInstance,
        classConfig,
      });
      summaryByClass[classConfig.mediaClass].referencedObjects = referencedKeys.size;

      for (const referencedObjectKey of Array.from(referencedKeys.values()).sort((a, b) =>
        a.localeCompare(b),
      )) {
        const localSource = localMapByClass[classConfig.mediaClass].get(
          referencedObjectKey,
        );
        const destinationProbe = await probeDestination({
          mediaClass: classConfig.mediaClass,
          bucket: classConfig.bucket,
          objectKey: referencedObjectKey,
        });

        if (destinationProbe.state === 'ok') {
          references.push({
            mediaClass: classConfig.mediaClass,
            objectKey: referencedObjectKey,
            hasLocalSource: Boolean(localSource),
            destinationExists: true,
            destinationSha256: destinationProbe.hashSha256,
            status: 'ok',
            attempts: destinationProbe.attempts,
            note: null,
          });
          continue;
        }

        if (destinationProbe.state === 'missing') {
          references.push({
            mediaClass: classConfig.mediaClass,
            objectKey: referencedObjectKey,
            hasLocalSource: Boolean(localSource),
            destinationExists: false,
            destinationSha256: null,
            status: 'missing_destination',
            attempts: destinationProbe.attempts,
            note: localSource
              ? 'Referenced object missing in destination (local source exists).'
              : 'Referenced object missing in destination and local source is unavailable.',
          });
          continue;
        }

        references.push({
          mediaClass: classConfig.mediaClass,
          objectKey: referencedObjectKey,
          hasLocalSource: Boolean(localSource),
          destinationExists: false,
          destinationSha256: null,
          status: 'probe_error',
          attempts: destinationProbe.attempts,
          note: destinationProbe.reason,
        });
      }
    }
  }

  await payloadInstance?.db?.destroy?.().catch(() => null);

  const totals = {
    localFiles: files.length,
    referencedObjects: references.length,
    alreadySynced: files.filter((entry) => entry.status === 'already_synced').length,
    missingDestination: files.filter((entry) => entry.status === 'missing_destination').length,
    copied: files.filter((entry) => entry.status === 'copied').length,
    overwritten: files.filter((entry) => entry.status === 'overwritten').length,
    mismatchSkipped: files.filter((entry) => entry.status === 'mismatch_skipped').length,
    errors: files.filter((entry) => entry.status === 'error').length,
    referenceMissingDestination: references.filter(
      (entry) => entry.status === 'missing_destination',
    ).length,
    referenceProbeErrors: references.filter((entry) => entry.status === 'probe_error').length,
  };

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    verificationMode: options.skipDb ? 'storage-only' : 'db-and-storage',
    overwriteMismatch: options.overwriteMismatch,
    strict: options.strict,
    timeoutMs: options.timeoutMs,
    endpointCandidates,
    authMode: credentials ? 'signed' : 'unsigned',
    classes: {
      avatars: {
        bucket: MEDIA_CLASS_TO_BUCKET.avatars,
        roots: resolveMediaLocalRoots('avatars'),
        summary: summaryByClass.avatars,
      },
      gallery: {
        bucket: MEDIA_CLASS_TO_BUCKET.gallery,
        roots: resolveMediaLocalRoots('gallery'),
        summary: summaryByClass.gallery,
      },
      tasks: {
        bucket: MEDIA_CLASS_TO_BUCKET.tasks,
        roots: resolveMediaLocalRoots('tasks'),
        summary: summaryByClass.tasks,
      },
      badges: {
        bucket: MEDIA_CLASS_TO_BUCKET.badges,
        roots: resolveMediaLocalRoots('badges'),
        summary: summaryByClass.badges,
      },
    },
    files,
    references,
    totals,
  };

  await ensureParentDir(options.outputJson);
  await fs.promises.writeFile(
    options.outputJson,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  if (options.outputMd) {
    await ensureParentDir(options.outputMd);
    await fs.promises.writeFile(options.outputMd, `${toMarkdown(manifest)}\n`, 'utf8');
  }

  logger.info(
    `[backfill-seaweed-media] wrote manifest: ${options.outputJson}`,
  );
  if (options.outputMd) {
    logger.info(
      `[backfill-seaweed-media] wrote markdown summary: ${options.outputMd}`,
    );
  }
  logger.info(
    `[backfill-seaweed-media] totals local=${totals.localFiles} copied=${totals.copied} overwritten=${totals.overwritten} missing=${totals.missingDestination} mismatchSkipped=${totals.mismatchSkipped} errors=${totals.errors} referenceMissing=${totals.referenceMissingDestination}`,
  );

  if (totals.errors > 0) {
    throw new Error(
      `[backfill-seaweed-media] completed with ${totals.errors} file-level errors.`,
    );
  }
  if (options.strict && totals.referenceMissingDestination > 0) {
    throw new Error(
      `[backfill-seaweed-media] strict mode failed: ${totals.referenceMissingDestination} referenced objects are still missing in destination.`,
    );
  }
  if (options.strict && totals.referenceProbeErrors > 0) {
    throw new Error(
      `[backfill-seaweed-media] strict mode failed: ${totals.referenceProbeErrors} referenced objects could not be probed.`,
    );
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(
      '[backfill-seaweed-media] failed',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
