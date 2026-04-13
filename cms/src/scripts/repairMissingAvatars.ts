process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import process from 'node:process';

import payload, { type Payload } from 'payload';
import payloadConfig from '@/payload.config.ts';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;

type Options = {
  apply: boolean;
  baseUrl: URL;
  timeoutMs: number;
};

type AvatarDoc = {
  id: number | string;
  filename: string;
};

type UserDoc = {
  id: number | string;
  avatarUrl?: unknown;
};

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  let apply = false;
  let base = DEFAULT_BASE_URL;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--base' && typeof next === 'string') {
      base = next;
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms' && typeof next === 'string') {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed;
      }
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apply,
    baseUrl: new URL(base),
    timeoutMs,
  };
};

const encodePathSegments = (value: string) =>
  trim(value)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const decodeSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractAvatarFilenameFromUrl = (value: unknown): string => {
  const raw = trim(value);
  if (!raw) return '';

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
    const relative = pathname.slice(index + prefix.length).replace(/^\/+/, '');
    if (!relative) continue;
    return decodeSafe(relative);
  }

  return '';
};

const shouldClearAvatarUrl = (avatarUrl: unknown, filename: string): boolean => {
  const current = extractAvatarFilenameFromUrl(avatarUrl);
  if (!current) return false;
  return current === filename;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': 'astral-avatar-repair',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
};

const probeStatus = async (url: string, timeoutMs: number): Promise<number> => {
  try {
    const head = await fetchWithTimeout(url, { method: 'HEAD' }, timeoutMs);
    if (head.status !== 405 && head.status !== 501) {
      return head.status;
    }

    const get = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      },
      timeoutMs,
    );
    return get.status;
  } catch {
    return 0;
  }
};

const listAvatars = async (instance: Payload): Promise<AvatarDoc[]> => {
  const docs: AvatarDoc[] = [];
  let page = 1;

  while (true) {
    const result = await instance.find({
      collection: 'avatars',
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
    });

    if (!result.docs.length) break;

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      const id = doc.id;
      if (typeof id !== 'number' && typeof id !== 'string') continue;
      const filename = trim(doc.filename);
      if (!filename) continue;
      docs.push({ id, filename });
    }

    if (page >= result.totalPages) break;
    page += 1;
  }

  return docs;
};

const listUsersByAvatar = async (instance: Payload, avatarId: number | string): Promise<UserDoc[]> => {
  const users: UserDoc[] = [];
  let page = 1;

  while (true) {
    const result = await instance.find({
      collection: 'users',
      page,
      limit: PAGE_SIZE,
      depth: 0,
      overrideAccess: true,
      where: {
        avatar: {
          equals: avatarId,
        },
      },
    });

    if (!result.docs.length) break;

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      const id = doc.id;
      if (typeof id !== 'number' && typeof id !== 'string') continue;
      users.push({ id, avatarUrl: doc.avatarUrl });
    }

    if (page >= result.totalPages) break;
    page += 1;
  }

  return users;
};

const run = async () => {
  const options = parseArgs();
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ script: 'repair-missing-avatars' }) ?? instance.logger ?? console;

  logger.info?.(
    {
      mode: options.apply ? 'apply' : 'dry-run',
      base: options.baseUrl.origin,
      timeoutMs: options.timeoutMs,
    },
    '[repair-missing-avatars] starting',
  );

  const avatars = await listAvatars(instance);
  const missing: AvatarDoc[] = [];
  let probeErrors = 0;

  for (const avatar of avatars) {
    const probe = new URL(`/api/avatars/file/${encodePathSegments(avatar.filename)}`, options.baseUrl).toString();
    const status = await probeStatus(probe, options.timeoutMs);
    if (status === 404) {
      missing.push(avatar);
    } else if (status === 0) {
      probeErrors += 1;
      logger.warn?.({ avatarId: avatar.id, filename: avatar.filename, probe }, '[repair-missing-avatars] probe failed');
    }
  }

  let usersUpdated = 0;
  let avatarsDeleted = 0;
  let avatarDeleteFailures = 0;

  for (const avatar of missing) {
    const users = await listUsersByAvatar(instance, avatar.id);

    if (!options.apply) {
      logger.info?.(
        {
          avatarId: avatar.id,
          filename: avatar.filename,
          referencingUsers: users.length,
        },
        '[repair-missing-avatars] would prune missing avatar doc',
      );
      continue;
    }

    for (const user of users) {
      const updateData: Record<string, unknown> = { avatar: null };
      if (shouldClearAvatarUrl(user.avatarUrl, avatar.filename)) {
        updateData.avatarUrl = null;
      }

      await instance.update({
        collection: 'users',
        id: user.id,
        data: updateData,
        overrideAccess: true,
      });
      usersUpdated += 1;
    }

    try {
      await instance.delete({
        collection: 'avatars',
        id: avatar.id,
        overrideAccess: true,
      });
      avatarsDeleted += 1;
    } catch (error) {
      avatarDeleteFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn?.(
        {
          avatarId: avatar.id,
          filename: avatar.filename,
          err: message,
        },
        '[repair-missing-avatars] failed to delete missing avatar doc',
      );
    }
  }

  logger.info?.(
    {
      mode: options.apply ? 'apply' : 'dry-run',
      avatarsTotal: avatars.length,
      missingAvatars: missing.length,
      probeErrors,
      usersUpdated,
      avatarsDeleted,
      avatarDeleteFailures,
    },
    '[repair-missing-avatars] finished',
  );

  if (options.apply && avatarDeleteFailures > 0) {
    throw new Error(`Failed to delete ${avatarDeleteFailures} missing avatar docs.`);
  }

  await instance.db?.destroy?.().catch(() => null);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[repair-missing-avatars] failed', error);
  process.exit(1);
});
