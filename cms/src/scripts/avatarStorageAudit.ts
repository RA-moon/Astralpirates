process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { Payload } from 'payload';
import {
  fetchSeaweedObjectForClass,
  isSeaweedProviderEnabled,
  resolveMediaLocalRoots,
} from '@/app/api/_lib/mediaFileRoute';

type AuditClass =
  | 'healthy'
  | 'missing_local'
  | 'missing_object'
  | 'url_mismatch'
  | 'orphan_file'
  | 'orphan_doc';

type Options = {
  outputJson: string;
  outputTsv: string | null;
  outputMd: string | null;
  baseUrl: URL;
  pageSize: number;
  timeoutMs: number;
  routeProbe: boolean;
  seaweedProbe: boolean;
};

type AvatarDoc = {
  id: string;
  filename: string;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type UserRecord = {
  id: string;
  profileSlug: string | null;
  callSign: string | null;
  avatarId: string | null;
  avatarUrl: string | null;
};

type UrlProbe = {
  url: string;
  status: number;
  contentType: string | null;
  isImage: boolean;
  error: string | null;
};

type SeaweedProbe = {
  enabled: boolean;
  exists: boolean | null;
  status: number | null;
  contentType: string | null;
  attempts: string[];
};

type UserAuditRow = {
  class: Exclude<AuditClass, 'orphan_file' | 'orphan_doc'>;
  userId: string;
  profileSlug: string | null;
  callSign: string | null;
  avatarId: string | null;
  avatarDocExists: boolean;
  avatarDocFilename: string | null;
  avatarUrl: string | null;
  avatarUrlFilename: string | null;
  canonicalFilename: string | null;
  localExists: boolean;
  seaweed: SeaweedProbe;
  apiProbe: UrlProbe | null;
  legacyProbe: UrlProbe | null;
  notes: string[];
};

type OrphanDocRow = {
  class: 'orphan_doc';
  avatarId: string;
  filename: string;
  updatedAt: string | null;
};

type OrphanFileRow = {
  class: 'orphan_file';
  filename: string;
};

type AuditReport = {
  generatedAt: string;
  provider: string;
  routeProbeEnabled: boolean;
  seaweedProbeEnabled: boolean;
  baseUrl: string;
  summary: {
    usersWithAvatarData: number;
    byClass: Record<Exclude<AuditClass, 'orphan_file' | 'orphan_doc'>, number>;
    orphanDocs: number;
    orphanFiles: number;
    routeMimeRegressions: number;
  };
  users: UserAuditRow[];
  orphanDocs: OrphanDocRow[];
  orphanFiles: OrphanFileRow[];
};

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_TIMEOUT_MS = 12_000;

const usage = () => {
  // eslint-disable-next-line no-console
  console.log(`Usage: pnpm --dir cms exec tsx ./src/scripts/avatarStorageAudit.ts [options]

Builds a deterministic avatar storage audit manifest for T1.46.

Options:
  --output-json <path>      Output JSON report path (required)
  --output-tsv <path>       Optional TSV output path
  --output-md <path>        Optional markdown summary path
  --base-url <url>          Probe base URL (default: ${DEFAULT_BASE_URL})
  --page-size <n>           Payload pagination size (default: ${DEFAULT_PAGE_SIZE})
  --timeout-ms <n>          HTTP probe timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --skip-route-probe        Skip /api/avatars/file + /media/avatars HTTP probes
  --skip-seaweed-probe      Skip direct Seaweed object existence probes
  -h, --help                Show help
`);
};

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
};

const resolveAvatarRelationId = (value: unknown): string | null => {
  const direct = normalizeId(value);
  if (direct) return direct;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return resolveAvatarRelationId(record.id ?? null);
  }
  return null;
};

const normalizeFilename = (value: string): string =>
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

const filenameVariants = (value: string): string[] => {
  const normalized = normalizeFilename(value);
  if (!normalized) return [];
  return Array.from(
    new Set([
      normalized,
      normalizeFilename(decodeSafe(normalized)),
      normalizeFilename(normalized.replace(/\+/g, ' ')),
    ]).values(),
  ).filter((entry) => entry.length > 0);
};

const encodePathSegments = (value: string): string =>
  normalizeFilename(value)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const extractFilenameFromAvatarUrl = (value: string | null): string | null => {
  const raw = trim(value);
  if (!raw) return null;

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      pathname = raw;
    }
  }

  const prefixes = ['/api/avatars/file/', '/media/avatars/', '/avatars/'];
  for (const prefix of prefixes) {
    const index = pathname.indexOf(prefix);
    if (index === -1) continue;
    const relative = normalizeFilename(pathname.slice(index + prefix.length));
    if (!relative) continue;
    return decodeSafe(relative);
  }

  return null;
};

const isImageContentType = (value: string | null): boolean => {
  const normalized = trim(value).toLowerCase();
  return normalized.startsWith('image/');
};

const probeUrl = async ({
  url,
  timeoutMs,
}: {
  url: string;
  timeoutMs: number;
}): Promise<UrlProbe> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const finalize = (
    status: number,
    contentType: string | null,
    error: string | null,
  ): UrlProbe => ({
    url,
    status,
    contentType,
    isImage: isImageContentType(contentType),
    error,
  });

  try {
    const head = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'user-agent': 'astral-avatar-storage-audit',
      },
    });

    const headType = trim(head.headers.get('content-type')) || null;
    if (head.status !== 405 && head.status !== 501) {
      return finalize(head.status, headType, null);
    }

    const get = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'user-agent': 'astral-avatar-storage-audit',
        Range: 'bytes=0-0',
      },
    });

    const getType = trim(get.headers.get('content-type')) || null;
    return finalize(get.status, getType, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return finalize(0, null, message);
  } finally {
    clearTimeout(timer);
  }
};

const collectRelativeFiles = (root: string): string[] => {
  if (!fs.existsSync(root)) return [];

  const result: string[] = [];
  const stack = [root];

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
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = normalizeFilename(
        path.relative(root, absolutePath).split(path.sep).join('/'),
      );
      if (!relativePath) continue;
      result.push(relativePath);
    }
  }

  result.sort((a, b) => a.localeCompare(b));
  return result;
};

const paginateCollection = async <T>(
  instance: Payload,
  collection: 'avatars' | 'users',
  pageSize: number,
): Promise<T[]> => {
  const docs: T[] = [];

  for (let page = 1; page <= 1_000; page += 1) {
    const response = await instance.find({
      collection,
      page,
      limit: pageSize,
      depth: 0,
      overrideAccess: true,
    });

    docs.push(...(response.docs as T[]));

    if (!response.docs.length || page >= response.totalPages) {
      break;
    }
  }

  return docs;
};

const loadAvatarDocs = async (
  instance: Payload,
  pageSize: number,
): Promise<Map<string, AvatarDoc>> => {
  const docs = await paginateCollection<Record<string, unknown>>(instance, 'avatars', pageSize);
  const map = new Map<string, AvatarDoc>();

  for (const doc of docs) {
    const id = normalizeId(doc.id);
    const filename = normalizeFilename(trim(doc.filename));
    if (!id || !filename) continue;

    map.set(id, {
      id,
      filename,
      url: trim(doc.url) || null,
      createdAt: trim(doc.createdAt) || null,
      updatedAt: trim(doc.updatedAt) || null,
    });
  }

  return map;
};

const loadUsers = async (
  instance: Payload,
  pageSize: number,
): Promise<UserRecord[]> => {
  const docs = await paginateCollection<Record<string, unknown>>(instance, 'users', pageSize);
  const users: UserRecord[] = [];

  for (const doc of docs) {
    const id = normalizeId(doc.id);
    if (!id) continue;

    const avatarId = resolveAvatarRelationId(doc.avatar ?? null);
    const avatarUrl = trim(doc.avatarUrl) || null;
    if (!avatarId && !avatarUrl) continue;

    users.push({
      id,
      profileSlug: trim(doc.profileSlug) || null,
      callSign: trim(doc.callSign) || null,
      avatarId,
      avatarUrl,
    });
  }

  users.sort((a, b) => {
    const slugA = a.profileSlug ?? `~${a.id}`;
    const slugB = b.profileSlug ?? `~${b.id}`;
    return slugA.localeCompare(slugB);
  });

  return users;
};

const classifyUserRow = ({
  avatarId,
  avatarDoc,
  canonicalFilename,
  avatarUrlFilename,
  apiProbe,
  localExists,
  seaweed,
}: {
  avatarId: string | null;
  avatarDoc: AvatarDoc | null;
  canonicalFilename: string | null;
  avatarUrlFilename: string | null;
  apiProbe: UrlProbe | null;
  localExists: boolean;
  seaweed: SeaweedProbe;
}): Exclude<AuditClass, 'orphan_file' | 'orphan_doc'> => {
  if (avatarId && !avatarDoc) return 'missing_object';

  const relationFilename = avatarDoc?.filename ?? null;
  if (relationFilename && avatarUrlFilename && relationFilename !== avatarUrlFilename) {
    return 'url_mismatch';
  }

  if (!canonicalFilename) return 'missing_object';

  if (apiProbe && apiProbe.status > 0 && apiProbe.status !== 200) {
    return 'missing_object';
  }

  if (seaweed.enabled && seaweed.exists === false) {
    return 'missing_object';
  }

  if (!localExists) {
    return 'missing_local';
  }

  return 'healthy';
};

const ensureDirForFile = (targetPath: string) => {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
};

const writeTsv = ({
  targetPath,
  users,
  orphanDocs,
  orphanFiles,
}: {
  targetPath: string;
  users: UserAuditRow[];
  orphanDocs: OrphanDocRow[];
  orphanFiles: OrphanFileRow[];
}) => {
  const lines: string[] = [];
  lines.push([
    'row_type',
    'class',
    'user_id',
    'profile_slug',
    'call_sign',
    'avatar_id',
    'avatar_doc_exists',
    'avatar_doc_filename',
    'avatar_url',
    'avatar_url_filename',
    'canonical_filename',
    'local_exists',
    'seaweed_probe_enabled',
    'seaweed_exists',
    'seaweed_status',
    'api_status',
    'api_content_type',
    'legacy_status',
    'legacy_content_type',
    'notes',
  ].join('\t'));

  for (const row of users) {
    lines.push([
      'user',
      row.class,
      row.userId,
      row.profileSlug ?? '',
      row.callSign ?? '',
      row.avatarId ?? '',
      row.avatarDocExists ? '1' : '0',
      row.avatarDocFilename ?? '',
      row.avatarUrl ?? '',
      row.avatarUrlFilename ?? '',
      row.canonicalFilename ?? '',
      row.localExists ? '1' : '0',
      row.seaweed.enabled ? '1' : '0',
      row.seaweed.exists == null ? '' : row.seaweed.exists ? '1' : '0',
      row.seaweed.status == null ? '' : String(row.seaweed.status),
      row.apiProbe ? String(row.apiProbe.status) : '',
      row.apiProbe?.contentType ?? '',
      row.legacyProbe ? String(row.legacyProbe.status) : '',
      row.legacyProbe?.contentType ?? '',
      row.notes.join('; '),
    ].join('\t'));
  }

  for (const row of orphanDocs) {
    lines.push([
      'orphan_doc',
      row.class,
      '',
      '',
      '',
      row.avatarId,
      '',
      row.filename,
      '',
      '',
      row.filename,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `updated_at=${row.updatedAt ?? ''}`,
    ].join('\t'));
  }

  for (const row of orphanFiles) {
    lines.push([
      'orphan_file',
      row.class,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      row.filename,
      '1',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join('\t'));
  }

  ensureDirForFile(targetPath);
  fs.writeFileSync(targetPath, `${lines.join('\n')}\n`, 'utf8');
};

const writeMarkdown = ({
  targetPath,
  report,
}: {
  targetPath: string;
  report: AuditReport;
}) => {
  const topRows = report.users.slice(0, 25);

  const lines: string[] = [];
  lines.push('# Avatar Storage Audit');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Provider: \`${report.provider}\``);
  lines.push(`- Base URL: \`${report.baseUrl}\``);
  lines.push(`- Route probe enabled: \`${report.routeProbeEnabled}\``);
  lines.push(`- Seaweed probe enabled: \`${report.seaweedProbeEnabled}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Users with avatar data: **${report.summary.usersWithAvatarData}**`);
  lines.push(`- Healthy: **${report.summary.byClass.healthy}**`);
  lines.push(`- Missing local: **${report.summary.byClass.missing_local}**`);
  lines.push(`- Missing object: **${report.summary.byClass.missing_object}**`);
  lines.push(`- URL mismatch: **${report.summary.byClass.url_mismatch}**`);
  lines.push(`- Orphan docs: **${report.summary.orphanDocs}**`);
  lines.push(`- Orphan files: **${report.summary.orphanFiles}**`);
  lines.push(`- Route MIME regressions (` + '`200` non-image): **' + `${report.summary.routeMimeRegressions}` + '**');
  lines.push('');

  lines.push('## Sample Rows');
  lines.push('');
  lines.push('| Class | Profile | Avatar ID | Canonical Filename | Local | Seaweed | API | Legacy | Notes |');
  lines.push('|---|---|---:|---|---|---|---|---|---|');

  for (const row of topRows) {
    const notes = row.notes.join('; ').replaceAll('|', '/');
    const seaweedCell = row.seaweed.enabled
      ? `${row.seaweed.exists == null ? '-' : row.seaweed.exists ? 'ok' : 'missing'}${
          row.seaweed.status == null ? '' : ` (${row.seaweed.status})`
        }`
      : 'skipped';
    lines.push(
      `| ${row.class} | ${row.profileSlug ?? row.userId} | ${row.avatarId ?? '-'} | ${
        row.canonicalFilename ?? '-'
      } | ${row.localExists ? 'yes' : 'no'} | ${seaweedCell} | ${
        row.apiProbe ? `${row.apiProbe.status} ${row.apiProbe.contentType ?? '-'}` : '-'
      } | ${
        row.legacyProbe ? `${row.legacyProbe.status} ${row.legacyProbe.contentType ?? '-'}` : '-'
      } | ${notes || '-'} |`,
    );
  }

  ensureDirForFile(targetPath);
  fs.writeFileSync(targetPath, `${lines.join('\n')}\n`, 'utf8');
};

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  let outputJson = '';
  let outputTsv: string | null = null;
  let outputMd: string | null = null;
  let baseUrl = DEFAULT_BASE_URL;
  let pageSize = DEFAULT_PAGE_SIZE;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let routeProbe = true;
  let seaweedProbe = isSeaweedProviderEnabled();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }

    if (arg === '--output-json' && typeof next === 'string') {
      outputJson = next;
      index += 1;
      continue;
    }
    if (arg === '--output-tsv' && typeof next === 'string') {
      outputTsv = next;
      index += 1;
      continue;
    }
    if (arg === '--output-md' && typeof next === 'string') {
      outputMd = next;
      index += 1;
      continue;
    }
    if (arg === '--base-url' && typeof next === 'string') {
      baseUrl = next;
      index += 1;
      continue;
    }
    if (arg === '--page-size' && typeof next === 'string') {
      pageSize = toPositiveInt(next, DEFAULT_PAGE_SIZE);
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms' && typeof next === 'string') {
      timeoutMs = toPositiveInt(next, DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }
    if (arg === '--skip-route-probe') {
      routeProbe = false;
      continue;
    }
    if (arg === '--skip-seaweed-probe') {
      seaweedProbe = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!outputJson) {
    throw new Error('--output-json is required.');
  }

  return {
    outputJson,
    outputTsv,
    outputMd,
    baseUrl: new URL(baseUrl),
    pageSize,
    timeoutMs,
    routeProbe,
    seaweedProbe,
  };
};

const run = async () => {
  const options = parseArgs();

  const payloadConfig = (await import('@/payload.config.ts')).default;
  const payload = (await import('payload')).default;
  const instance = await payload.init({ config: payloadConfig });
  const logger =
    instance.logger?.child?.({ script: 'avatar-storage-audit' }) ??
    instance.logger ??
    console;

  logger.info?.(
    {
      outputJson: options.outputJson,
      outputTsv: options.outputTsv,
      outputMd: options.outputMd,
      baseUrl: options.baseUrl.origin,
      routeProbe: options.routeProbe,
      seaweedProbe: options.seaweedProbe,
      pageSize: options.pageSize,
    },
    '[avatar-storage-audit] starting',
  );

  const avatarDocsById = await loadAvatarDocs(instance, options.pageSize);
  const users = await loadUsers(instance, options.pageSize);

  const localRoots = resolveMediaLocalRoots('avatars');
  const localFiles = new Set<string>();
  for (const root of localRoots) {
    for (const relative of collectRelativeFiles(root)) {
      localFiles.add(relative);
    }
  }

  const referencedDocIds = new Set<string>();
  const referencedFilenames = new Set<string>();

  const userRows: UserAuditRow[] = [];

  for (const user of users) {
    const avatarDoc = user.avatarId ? avatarDocsById.get(user.avatarId) ?? null : null;
    if (user.avatarId) referencedDocIds.add(user.avatarId);

    const avatarUrlFilename = extractFilenameFromAvatarUrl(user.avatarUrl);
    const relationFilename = avatarDoc?.filename ?? null;
    const canonicalFilename = relationFilename ?? avatarUrlFilename ?? null;

    if (relationFilename) {
      referencedFilenames.add(relationFilename);
    }
    if (avatarUrlFilename) {
      referencedFilenames.add(avatarUrlFilename);
    }
    if (canonicalFilename) {
      referencedFilenames.add(canonicalFilename);
    }

    const localExists = canonicalFilename
      ? filenameVariants(canonicalFilename).some((candidate) => localFiles.has(candidate))
      : false;

    let seaweed: SeaweedProbe = {
      enabled: options.seaweedProbe,
      exists: null,
      status: null,
      contentType: null,
      attempts: [],
    };

    if (options.seaweedProbe && canonicalFilename) {
      const upstream = await fetchSeaweedObjectForClass({
        mediaClass: 'avatars',
        objectPath: canonicalFilename,
        method: 'HEAD',
      });
      seaweed = {
        enabled: true,
        exists: Boolean(upstream.response),
        status: upstream.response?.status ?? 0,
        contentType: trim(upstream.response?.headers.get('content-type')) || null,
        attempts: upstream.attempts,
      };
    }

    let apiProbe: UrlProbe | null = null;
    let legacyProbe: UrlProbe | null = null;

    if (options.routeProbe && canonicalFilename) {
      const encoded = encodePathSegments(canonicalFilename);
      apiProbe = await probeUrl({
        url: new URL(`/api/avatars/file/${encoded}`, options.baseUrl).toString(),
        timeoutMs: options.timeoutMs,
      });
      legacyProbe = await probeUrl({
        url: new URL(`/media/avatars/${encoded}`, options.baseUrl).toString(),
        timeoutMs: options.timeoutMs,
      });
    }

    const notes: string[] = [];
    if (user.avatarId && !avatarDoc) notes.push('avatar_relation_doc_missing');
    if (relationFilename && avatarUrlFilename && relationFilename !== avatarUrlFilename) {
      notes.push('avatar_url_filename_mismatch');
    }
    if (apiProbe && apiProbe.status === 200 && !apiProbe.isImage) {
      notes.push('api_route_200_non_image');
    }
    if (legacyProbe && legacyProbe.status === 200 && !legacyProbe.isImage) {
      notes.push('legacy_route_200_non_image');
    }
    if (seaweed.enabled && seaweed.exists === false) {
      notes.push('seaweed_object_missing');
    }
    if (canonicalFilename && !localExists) {
      notes.push('local_file_missing');
    }

    const rowClass = classifyUserRow({
      avatarId: user.avatarId,
      avatarDoc,
      canonicalFilename,
      avatarUrlFilename,
      apiProbe,
      localExists,
      seaweed,
    });

    userRows.push({
      class: rowClass,
      userId: user.id,
      profileSlug: user.profileSlug,
      callSign: user.callSign,
      avatarId: user.avatarId,
      avatarDocExists: Boolean(avatarDoc),
      avatarDocFilename: relationFilename,
      avatarUrl: user.avatarUrl,
      avatarUrlFilename,
      canonicalFilename,
      localExists,
      seaweed,
      apiProbe,
      legacyProbe,
      notes,
    });
  }

  userRows.sort((a, b) => {
    const keyA = a.profileSlug ?? `~${a.userId}`;
    const keyB = b.profileSlug ?? `~${b.userId}`;
    return keyA.localeCompare(keyB);
  });

  const orphanDocs: OrphanDocRow[] = [];
  for (const avatarDoc of Array.from(avatarDocsById.values())) {
    if (referencedDocIds.has(avatarDoc.id)) continue;
    if (referencedFilenames.has(avatarDoc.filename)) continue;
    orphanDocs.push({
      class: 'orphan_doc',
      avatarId: avatarDoc.id,
      filename: avatarDoc.filename,
      updatedAt: avatarDoc.updatedAt,
    });
  }
  orphanDocs.sort((a, b) => a.filename.localeCompare(b.filename));

  const avatarDocFilenames = new Set<string>(Array.from(avatarDocsById.values()).map((entry) => entry.filename));
  const orphanFiles: OrphanFileRow[] = [];
  for (const localFile of Array.from(localFiles).sort((a, b) => a.localeCompare(b))) {
    if (avatarDocFilenames.has(localFile)) continue;
    if (referencedFilenames.has(localFile)) continue;
    orphanFiles.push({
      class: 'orphan_file',
      filename: localFile,
    });
  }

  const byClass: Record<Exclude<AuditClass, 'orphan_file' | 'orphan_doc'>, number> = {
    healthy: 0,
    missing_local: 0,
    missing_object: 0,
    url_mismatch: 0,
  };

  let routeMimeRegressions = 0;
  for (const row of userRows) {
    byClass[row.class] += 1;
    if (row.notes.includes('api_route_200_non_image') || row.notes.includes('legacy_route_200_non_image')) {
      routeMimeRegressions += 1;
    }
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    provider: process.env.MEDIA_STORAGE_PROVIDER ?? 'local',
    routeProbeEnabled: options.routeProbe,
    seaweedProbeEnabled: options.seaweedProbe,
    baseUrl: options.baseUrl.origin,
    summary: {
      usersWithAvatarData: userRows.length,
      byClass,
      orphanDocs: orphanDocs.length,
      orphanFiles: orphanFiles.length,
      routeMimeRegressions,
    },
    users: userRows,
    orphanDocs,
    orphanFiles,
  };

  ensureDirForFile(options.outputJson);
  fs.writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (options.outputTsv) {
    writeTsv({
      targetPath: options.outputTsv,
      users: userRows,
      orphanDocs,
      orphanFiles,
    });
  }

  if (options.outputMd) {
    writeMarkdown({
      targetPath: options.outputMd,
      report,
    });
  }

  logger.info?.(
    {
      outputJson: options.outputJson,
      outputTsv: options.outputTsv,
      outputMd: options.outputMd,
      users: report.summary.usersWithAvatarData,
      byClass,
      orphanDocs: report.summary.orphanDocs,
      orphanFiles: report.summary.orphanFiles,
      routeMimeRegressions,
    },
    '[avatar-storage-audit] finished',
  );

  await instance.db?.destroy?.().catch(() => null);
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('[avatar-storage-audit] failed', message);
  process.exit(1);
});
