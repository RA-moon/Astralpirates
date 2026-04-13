import {
  MEDIA_DEFAULT_BUCKETS,
  resolveMediaBucketName,
} from '@astralpirates/shared/mediaUrls';

type MediaSmokeClass = 'avatars' | 'gallery' | 'tasks' | 'badges';
const BADGE_SMOKE_CODE = 'pioneer';

const provider = process.env.MEDIA_STORAGE_PROVIDER ?? 'local';

if (provider !== 'seaweedfs') {
  console.log(`[media-storage-smoke] skipped: MEDIA_STORAGE_PROVIDER=${provider}`);
  process.exit(0);
}

const baseUrl = (
  process.env.CMS_BASE_URL ??
  process.env.PAYLOAD_PUBLIC_SERVER_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '');
const mediaBaseUrl = (process.env.MEDIA_BASE_URL ?? 'http://localhost:3000/media').replace(/\/+$/, '');
const MEDIA_BUCKET_ENV_KEYS: Record<MediaSmokeClass, string> = {
  avatars: 'MEDIA_BUCKET_AVATARS',
  gallery: 'MEDIA_BUCKET_GALLERY',
  tasks: 'MEDIA_BUCKET_TASKS',
  badges: 'MEDIA_BUCKET_BADGES',
};
const MEDIA_CLASS_ORDER: MediaSmokeClass[] = ['avatars', 'gallery', 'tasks', 'badges'];
const resolveBucketForClass = (mediaClass: MediaSmokeClass): string =>
  resolveMediaBucketName(
    process.env[MEDIA_BUCKET_ENV_KEYS[mediaClass]],
    MEDIA_DEFAULT_BUCKETS[mediaClass],
  );
const resolveExpectedPrefixForClass = (mediaClass: MediaSmokeClass): string =>
  `${mediaBaseUrl}/${resolveBucketForClass(mediaClass)}/`;
const requestTimeoutMs = Number.parseInt(process.env.MEDIA_SMOKE_TIMEOUT_MS ?? '', 10) || 45_000;

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2S4J8AAAAASUVORK5CYII=',
  'base64',
);

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractFilenameFromUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim().length) return null;
  const trimmed = value.trim();
  const pathname = (() => {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed.split('?')[0] ?? trimmed;
    }
  })();
  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? '';
  if (!lastSegment.length) return null;
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
};

const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const safeJson = async (response: Response): Promise<any> => {
  const body = await response.text();
  if (!body.trim().length) return null;
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
};

const extractErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return '';
  const direct = (
    typeof (payload as any).error === 'string'
      ? (payload as any).error
      : typeof (payload as any).message === 'string'
        ? (payload as any).message
        : ''
  ).trim();
  if (direct.length) return direct;
  const errors = Array.isArray((payload as any).errors) ? (payload as any).errors : [];
  for (const entry of errors) {
    if (entry && typeof entry.message === 'string' && entry.message.trim().length > 0) {
      return entry.message.trim();
    }
  }
  return '';
};

const resolveCandidateEmails = (): string[] => {
  const seedTestcase = (process.env.CMS_SEED_TESTCASE ?? 'roles').trim() || 'roles';
  return Array.from(
    new Set(
      [
        process.env.CHECK_TASK_SSE_EMAIL,
        process.env.CMS_SEED_CAPTAIN_EMAIL,
        `test-${seedTestcase}.captain@astralpirates.com`,
        'test-roles.captain@astralpirates.com',
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );
};

const resolveSeedPassword = (): string | null => {
  const raw = process.env.SEED_DEFAULT_PASSWORD;
  const password = typeof raw === 'string' ? raw.trim() : '';
  return password.length ? password : null;
};

const loginForToken = async (password: string): Promise<string> => {
  const candidates = resolveCandidateEmails();
  if (!candidates.length) {
    throw new Error('[media-storage-smoke] no candidate seeded captain emails found.');
  }

  const attempts: string[] = [];
  for (const email of candidates) {
    const response = await withTimeout((signal) =>
      fetch(`${baseUrl}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal,
      }),
    );
    const payload = await safeJson(response);
    if (response.ok) {
      const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
      if (!token.length) {
        throw new Error(`[media-storage-smoke] login succeeded for ${email} but token was missing.`);
      }
      return token;
    }

    const message = extractErrorMessage(payload);
    attempts.push(`${email}:${response.status}${message ? ` (${message})` : ''}`);
  }

  throw new Error(
    `[media-storage-smoke] failed to authenticate seeded user (${attempts.join(', ')})`,
  );
};

const createAvatar = async (token: string): Promise<{ id: number; url: string }> => {
  const formData = new FormData();
  formData.append('alt', 'Media storage smoke avatar');
  formData.append(
    'file',
    new Blob([pngBytes], { type: 'image/png' }),
    'media-smoke.png',
  );

  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}/api/avatars`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: formData,
      signal,
    }),
  );
  const payload = await safeJson(response);
  if (response.status !== 201) {
    const message = extractErrorMessage(payload);
    throw new Error(
      `[media-storage-smoke] expected 201 from /api/avatars, received ${response.status}${message ? ` (${message})` : ''}`,
    );
  }

  const idValue = payload?.id ?? payload?.doc?.id;
  const parsedId = typeof idValue === 'number' ? idValue : Number.parseInt(String(idValue ?? ''), 10);
  if (!Number.isFinite(parsedId)) {
    throw new Error('[media-storage-smoke] avatar upload response missing id.');
  }

  const url = typeof payload?.url === 'string'
    ? payload.url.trim()
    : typeof payload?.doc?.url === 'string'
      ? payload.doc.url.trim()
      : '';
  if (!url.length) {
    throw new Error('[media-storage-smoke] avatar upload response missing url.');
  }

  return { id: parsedId, url };
};

const resolveBadgeRecordFromPayload = (payload: any): {
  id: number;
  url: string;
  filename: string;
} => {
  const id = parseNumericId(payload?.id ?? payload?.doc?.id);
  if (id == null) {
    throw new Error('[media-storage-smoke] honor badge upload response missing id.');
  }

  const url = typeof payload?.url === 'string'
    ? payload.url.trim()
    : typeof payload?.doc?.url === 'string'
      ? payload.doc.url.trim()
      : '';
  if (!url.length) {
    throw new Error('[media-storage-smoke] honor badge upload response missing url.');
  }

  const filename = (() => {
    const direct = typeof payload?.filename === 'string'
      ? payload.filename.trim()
      : typeof payload?.doc?.filename === 'string'
        ? payload.doc.filename.trim()
        : '';
    if (direct.length) return direct;
    return extractFilenameFromUrl(url) ?? '';
  })();
  if (!filename.length) {
    throw new Error('[media-storage-smoke] honor badge upload response missing filename.');
  }

  return { id, url, filename };
};

const verifyHonorBadgeProxyRead = async (filename: string): Promise<void> => {
  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}/api/honor-badge-media/file/${encodeURIComponent(filename)}`, {
      headers: {
        Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
      signal,
    }),
  );
  if (response.status !== 200) {
    throw new Error(
      `[media-storage-smoke] expected 200 from /api/honor-badge-media/file/${filename}, received ${response.status}`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('image/png')) {
    throw new Error(
      `[media-storage-smoke] expected image/png from honor badge media proxy, received ${contentType || '<empty>'}`,
    );
  }

  const body = await response.arrayBuffer();
  if (body.byteLength <= 0) {
    throw new Error('[media-storage-smoke] honor badge proxy response body was empty.');
  }
};

const deleteAvatar = async (id: number, token: string): Promise<void> => {
  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}/api/avatars/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal,
    }),
  );
  if (response.status === 200 || response.status === 202 || response.status === 204 || response.status === 404) {
    return;
  }

  const payload = await safeJson(response);
  const message = extractErrorMessage(payload);
  throw new Error(
    `[media-storage-smoke] expected avatar cleanup to succeed for id=${id}, received ${response.status}${message ? ` (${message})` : ''}`,
  );
};

const resolveUploadedByUserId = async (payload: any): Promise<number> => {
  const candidates = resolveCandidateEmails();
  for (const email of candidates) {
    const result = await payload.find({
      collection: 'users',
      where: {
        email: {
          equals: email,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const user = result.docs[0];
    if (user?.id != null) {
      return user.id;
    }
  }

  const fallback = await payload.find({
    collection: 'users',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const user = fallback.docs[0];
  if (user?.id == null) {
    throw new Error('[media-storage-smoke] no user available for avatar upload smoke check.');
  }
  return user.id;
};

const getLocalPayloadInstance = async (): Promise<any> => {
  const [{ getPayload }, configModule] = await Promise.all([
    import('payload'),
    import('../../../payload.config.ts'),
  ]);
  return getPayload({ config: configModule.default });
};

const createAvatarViaLocalPayload = async (): Promise<{ id: number; url: string; payload: any }> => {
  const payload = await getLocalPayloadInstance();
  const uploadedByUserId = await resolveUploadedByUserId(payload);
  const avatar = await payload.create({
    collection: 'avatars',
    data: {
      alt: 'Media storage smoke avatar',
      uploadedBy: uploadedByUserId,
    },
    file: {
      data: pngBytes,
      mimetype: 'image/png',
      size: pngBytes.length,
      name: 'media-smoke.png',
      originalname: 'media-smoke.png',
      fieldname: 'file',
    },
    overrideAccess: true,
  });
  const id = typeof avatar?.id === 'number' ? avatar.id : Number.parseInt(String(avatar?.id ?? ''), 10);
  if (!Number.isFinite(id)) {
    throw new Error('[media-storage-smoke] local payload upload response missing id.');
  }
  const url = typeof avatar?.url === 'string' ? avatar.url.trim() : '';
  if (!url.length) {
    throw new Error('[media-storage-smoke] local payload upload response missing url.');
  }

  return { id, url, payload };
};

const createOrUpdateHonorBadgeMediaViaLocalPayload = async (
  payload: any,
): Promise<{ id: number; url: string; filename: string; created: boolean }> => {
  const existingResult = await payload.find({
    collection: 'honor-badge-media',
    where: {
      badgeCode: {
        equals: BADGE_SMOKE_CODE,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const existing = existingResult.docs[0];
  if (existing?.id != null) {
    const updated = await payload.update({
      collection: 'honor-badge-media',
      id: existing.id,
      data: {
        badgeCode: BADGE_SMOKE_CODE,
        alt: 'Media storage smoke badge',
      },
      file: {
        data: pngBytes,
        mimetype: 'image/png',
        size: pngBytes.length,
        name: 'media-badge-smoke.png',
        originalname: 'media-badge-smoke.png',
        fieldname: 'file',
      },
      overrideAccess: true,
    });
    const record = resolveBadgeRecordFromPayload(updated);
    return { ...record, created: false };
  }

  const uploadedByUserId = await resolveUploadedByUserId(payload);
  const created = await payload.create({
    collection: 'honor-badge-media',
    data: {
      badgeCode: BADGE_SMOKE_CODE,
      alt: 'Media storage smoke badge',
      uploadedBy: uploadedByUserId,
    },
    file: {
      data: pngBytes,
      mimetype: 'image/png',
      size: pngBytes.length,
      name: 'media-badge-smoke.png',
      originalname: 'media-badge-smoke.png',
      fieldname: 'file',
    },
    overrideAccess: true,
  });
  const record = resolveBadgeRecordFromPayload(created);
  return { ...record, created: true };
};

const verifyMediaConfigUrlWiring = async (): Promise<void> => {
  const { MEDIA_COLLECTION_CONFIG, buildMediaFileUrl } = await import('../../storage/mediaConfig.ts');
  for (const mediaClass of MEDIA_CLASS_ORDER) {
    const expectedPrefix = resolveExpectedPrefixForClass(mediaClass);
    const expectedStaticBase = expectedPrefix.replace(/\/$/, '');
    const staticUrl = `${MEDIA_COLLECTION_CONFIG[mediaClass].staticURL ?? ''}`.trim();
    if (!staticUrl.startsWith(expectedStaticBase)) {
      throw new Error(
        `[media-storage-smoke] expected MEDIA_COLLECTION_CONFIG.${mediaClass}.staticURL to start with ${expectedStaticBase}, received ${staticUrl || '<empty>'}`,
      );
    }

    const smokeFileUrl = buildMediaFileUrl(mediaClass, 'media-smoke-config.png');
    if (!smokeFileUrl.startsWith(expectedPrefix)) {
      throw new Error(
        `[media-storage-smoke] expected buildMediaFileUrl(${mediaClass}) to start with ${expectedPrefix}, received ${smokeFileUrl || '<empty>'}`,
      );
    }
  }
};

let createdAvatarId: number | null = null;
let createdBadgeId: number | null = null;
let createdBadgeForCleanup = false;
let authToken: string | null = null;
let payloadInstance: any = null;

try {
  await verifyMediaConfigUrlWiring();
  console.log('[media-storage-smoke] media config URL wiring verified for avatars/gallery/tasks/badges');

  const seedPassword = resolveSeedPassword();
  let avatarUrl = '';
  let badgeUrl = '';
  let badgeFilename = '';
  const expectedAvatarPrefix = resolveExpectedPrefixForClass('avatars');
  const expectedBadgePrefix = resolveExpectedPrefixForClass('badges');

  if (seedPassword) {
    try {
      authToken = await loginForToken(seedPassword);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[media-storage-smoke] seeded login unavailable (${message}); using local Payload API fallback.`,
      );
    }
  }

  if (authToken) {
    const avatar = await createAvatar(authToken);
    createdAvatarId = avatar.id;
    avatarUrl = avatar.url;
    payloadInstance = await getLocalPayloadInstance();
    const badge = await createOrUpdateHonorBadgeMediaViaLocalPayload(payloadInstance);
    createdBadgeId = badge.id;
    createdBadgeForCleanup = badge.created;
    badgeUrl = badge.url;
    badgeFilename = badge.filename;
  } else {
    console.log('[media-storage-smoke] using local Payload API fallback for media upload checks.');
    const localAvatar = await createAvatarViaLocalPayload();
    createdAvatarId = localAvatar.id;
    avatarUrl = localAvatar.url;
    payloadInstance = localAvatar.payload;
    const badge = await createOrUpdateHonorBadgeMediaViaLocalPayload(payloadInstance);
    createdBadgeId = badge.id;
    createdBadgeForCleanup = badge.created;
    badgeUrl = badge.url;
    badgeFilename = badge.filename;
  }

  if (!avatarUrl.startsWith(expectedAvatarPrefix)) {
    throw new Error(
      `[media-storage-smoke] expected avatar URL to start with ${expectedAvatarPrefix}, received ${String(avatarUrl)}`,
    );
  }
  if (!badgeUrl.startsWith(expectedBadgePrefix)) {
    throw new Error(
      `[media-storage-smoke] expected honor badge URL to start with ${expectedBadgePrefix}, received ${String(badgeUrl)}`,
    );
  }
  await verifyHonorBadgeProxyRead(badgeFilename);

  console.log(`[media-storage-smoke] uploaded avatar URL: ${avatarUrl}`);
  console.log(`[media-storage-smoke] uploaded honor badge URL: ${badgeUrl}`);
  console.log(`[media-storage-smoke] honor badge proxy verified via filename: ${badgeFilename}`);
} finally {
  if (createdAvatarId != null && authToken) {
    await deleteAvatar(createdAvatarId, authToken).catch(() => null);
  } else if (createdAvatarId != null && payloadInstance) {
    await payloadInstance.delete({
      collection: 'avatars',
      id: createdAvatarId,
      overrideAccess: true,
    }).catch(() => null);
  }

  if (createdBadgeForCleanup && createdBadgeId != null && payloadInstance) {
    await payloadInstance.delete({
      collection: 'honor-badge-media',
      id: createdBadgeId,
      overrideAccess: true,
    }).catch(() => null);
  }
}

process.exit(0);
