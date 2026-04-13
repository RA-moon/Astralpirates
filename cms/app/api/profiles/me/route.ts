import { Buffer } from 'node:buffer';

import type { NextRequest } from 'next/server';

import type { User } from '@/payload-types';

import { authenticateRequest, buildRequestForUser } from '../../_lib/auth';
import { corsEmpty, corsJson } from '../../_lib/cors';
import { resolveMediaModifyAccess } from '../../_lib/mediaAccess';
import { resolveAvatarUrlFromUpload, resolveAvatarUrlFromValue } from '../_lib/avatar';
import {
  resolveHonorBadgeMediaByCode,
  sanitizePrivateProfile,
} from '../_lib/sanitize';
import { buildMediaFileUrl, MEDIA_LIMITS_BYTES } from '@/src/storage/mediaConfig';
import {
  deduceAvatarMediaType,
  normalizeAvatarMediaType,
  resolveAvatarUploadMimeType,
  type AvatarMediaType,
} from '@astralpirates/shared/avatarMedia';
import { parseAdminModeFlag, resolveEffectiveAdminMode } from '@astralpirates/shared/adminMode';
import { queueMediaDelete } from '@/src/services/mediaLifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTH_METHODS = 'OPTIONS,GET,PATCH';
const MAX_AVATAR_BYTES = MEDIA_LIMITS_BYTES.avatar;
const AVATAR_COLLECTION = 'avatars';

const formatLimitLabel = (bytes: number): string => {
  const value = bytes / (1024 * 1024);
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} MB`;
};
const MAX_AVATAR_LABEL = formatLimitLabel(MAX_AVATAR_BYTES);

type UpdatableFields = Pick<User, 'callSign' | 'pronouns' | 'bio' | 'avatarUrl'> & {
  avatar?: number | null;
  avatarMediaType?: AvatarMediaType;
  adminModeViewPreference?: boolean;
  adminModeEditPreference?: boolean;
};

const jsonKeys: (keyof UpdatableFields)[] = ['callSign', 'pronouns', 'bio'];
const adminPreferenceKeys: (keyof Pick<
  UpdatableFields,
  'adminModeViewPreference' | 'adminModeEditPreference'
>)[] = ['adminModeViewPreference', 'adminModeEditPreference'];

const normalizeString = (value: FormDataEntryValue | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeAvatarMediaTypeInput = (
  value: FormDataEntryValue | string | null | undefined,
): AvatarMediaType | null =>
  normalizeAvatarMediaType(typeof value === 'string' ? value : null);

const resolveAvatarUrlUpdate = (
  payload: any,
  value: string,
): { url: string; isInternal: boolean } => {
  const resolved = resolveAvatarUrlFromValue(payload, value);
  if (resolved) {
    return { url: resolved, isInternal: true };
  }
  return { url: value, isInternal: false };
};

const numericId = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const resolveAvatarId = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('id' in record) {
      return resolveAvatarId(record.id);
    }
  }
  return numericId(value);
};

const deleteAvatarById = async (
  payload: any,
  id: unknown,
  req?: any,
  {
    mode = 'safe',
    reason = 'profile-avatar-cleanup',
  }: {
    mode?: 'safe' | 'force';
    reason?: string;
  } = {},
) => {
  const numeric = numericId(id);
  if (!numeric) return;
  try {
    await queueMediaDelete({
      payload,
      assetClass: 'avatar',
      assetId: numeric,
      mode,
      reason,
      requestedByUserId: numericId((req?.user as { id?: unknown } | null | undefined)?.id),
    });
  } catch (error) {
    payload.logger.warn({ err: error, avatarId: numeric }, 'Failed to delete old avatar');
  }
};

const cleanupUserAvatars = async (
  payload: any,
  owner: User,
  keepId: number | null,
  req?: any,
) => {
  try {
    const filters: any[] = [{ uploadedBy: { equals: owner.id } }];
    if (keepId != null) {
      filters.push({ id: { not_equals: keepId } });
    }

    const whereClause = filters.length > 1 ? { and: filters } : filters[0];
    const avatars = await payload.find({
      collection: AVATAR_COLLECTION,
      where: whereClause,
      depth: 0,
      limit: 50,
      overrideAccess: true,
    });

    if (!avatars?.docs?.length) return;

    for (const doc of avatars.docs) {
      const avatarId = numericId((doc as any)?.id);
      if (!avatarId || (keepId != null && avatarId === keepId)) continue;

      const usage = await payload.find({
        collection: 'users',
        where: { avatar: { equals: avatarId } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      });

      if (usage?.totalDocs && usage.totalDocs > 0) continue;
      await deleteAvatarById(payload, avatarId, req, {
        mode: 'safe',
        reason: 'profile-avatar-prune-unused',
      });
    }
  } catch (error) {
    payload.logger.warn({ err: error, userId: owner.id }, 'Failed to clean up unused avatars');
  }
};

const deleteAvatarIfUnused = async (payload: any, avatarId: number, req?: any) => {
  const usage = await payload.find({
    collection: 'users',
    where: { avatar: { equals: avatarId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });

  if (usage?.totalDocs && usage.totalDocs > 0) return;
  await deleteAvatarById(payload, avatarId, req, {
    mode: 'safe',
    reason: 'profile-avatar-replaced',
  });
};

const uploadAvatarToPayload = async (payload: any, file: File, userDoc: User, req?: any) => {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`Avatar exceeds the ${MAX_AVATAR_LABEL} limit.`);
  }

  const uploadMimeType = resolveAvatarUploadMimeType({
    fileType: file.type,
    filename: file.name,
  });

  if (!uploadMimeType) {
    throw new Error(
      'Unsupported avatar format. Upload an image, video, or supported 3D model (GLB/GLTF/OBJ/STL/FBX/USDZ).',
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadDoc: any = await payload.create({
    collection: AVATAR_COLLECTION,
    data: {
      alt:
        userDoc.callSign ??
        (userDoc.firstName ? `${userDoc.firstName}${userDoc.lastName ? ` ${userDoc.lastName}` : ''}` : null) ??
        userDoc.email,
    },
    draft: false,
    file: {
      data: buffer,
      mimetype: uploadMimeType,
      size: file.size,
      name: file.name || 'avatar',
      originalname: file.name || 'avatar',
      fieldname: 'file',
    },
    req,
  });

  const resolvedUrl =
    resolveAvatarUrlFromUpload(payload, uploadDoc) ??
    resolveAvatarUrlFromValue(payload, buildMediaFileUrl('avatars', uploadDoc?.filename) ?? null);

  return {
    id: uploadDoc.id as number,
    url: resolvedUrl,
    mimeType: uploadMimeType,
    mediaType: deduceAvatarMediaType({
      mimeType: uploadMimeType,
      filename: file.name,
      url: resolvedUrl,
    }),
  };
};

export async function GET(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, AUTH_METHODS);
  }

  const honorBadgeMediaByCode = await resolveHonorBadgeMediaByCode({
    payload: payload as any,
    users: [user],
  });
  return corsJson(
    req,
    { profile: sanitizePrivateProfile(user, { payload, honorBadgeMediaByCode }) },
    {},
    AUTH_METHODS,
  );
}

export async function PATCH(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, AUTH_METHODS);
  }

  const viewerId = numericId(user.id);
  if (viewerId == null) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, AUTH_METHODS);
  }
  const avatarModifyAccess = await resolveMediaModifyAccess({
    scope: 'avatar',
    payload: payload as any,
    user,
    ownerUserId: viewerId,
  });
  if (!avatarModifyAccess.allow) {
    return corsJson(req, { error: avatarModifyAccess.error }, { status: avatarModifyAccess.status }, AUTH_METHODS);
  }

  const start = Date.now();
  const log = (message: string, meta: Record<string, unknown> = {}) => {
    payload.logger.info(
      {
        component: 'profiles/me',
        duration: `${Date.now() - start}ms`,
        message,
        ...meta,
      },
      message,
    );
  };

  const localReq = await buildRequestForUser(payload, user);

  const contentType = req.headers.get('content-type') || '';
  const rawContentLength = req.headers.get('content-length') || '';
  const contentLength = Number.parseInt(rawContentLength, 10);
  log('received request', {
    contentType,
    contentLength: Number.isFinite(contentLength) ? contentLength : rawContentLength || null,
    hasAuthorization: req.headers.has('authorization'),
  });

  const update: Partial<UpdatableFields> = {};
  let avatarRemove = false;
  const previousAvatarId = resolveAvatarId((user as any).avatar ?? null);
  let newAvatar: {
    id: number;
    url: string | null;
    mimeType: string;
    mediaType: AvatarMediaType;
  } | null = null;
  const markTimeout = (details?: { label?: string; ms?: number }) => {
    payload.logger.warn(
      {
        component: 'profiles/me',
        userId: user.id,
        timeoutLabel: details?.label ?? null,
        timeoutMs: typeof details?.ms === 'number' ? details.ms : null,
      },
      'Profile update timed out; request will return 503',
    );
  };

  class TimeoutError extends Error {
    readonly label: string;
    readonly ms: number;

    constructor(label: string, ms: number) {
      super(`${label} exceeded ${ms}ms`);
      this.name = 'TimeoutError';
      this.label = label;
      this.ms = ms;
    }
  }

  const withTimeout = async <T>(promise: Promise<T>, label: string, ms = 20_000): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await withTimeout(req.formData(), 'formData parse', 10_000);
      const formKeys: string[] = [];
      for (const [key] of formData.entries()) {
        formKeys.push(key);
      }
      for (const key of jsonKeys) {
        if (key === 'avatarUrl') continue; // handled separately below
        const value = normalizeString(formData.get(key));
        if (value !== null) {
          update[key] = value as any;
        } else if (formData.has(key)) {
          update[key] = null as any;
        }
      }
      for (const key of adminPreferenceKeys) {
        if (!formData.has(key)) continue;
        update[key] = parseAdminModeFlag(formData.get(key));
      }

      const avatarFile = formData.get('avatar');
      if (
        formData.has('avatar') &&
        !(avatarFile instanceof File) &&
        Number.isFinite(contentLength) &&
        contentLength > 1024 &&
        normalizeString(formData.get('avatarUrl')) === null &&
        normalizeString(formData.get('avatarAction')) !== 'remove'
      ) {
        payload.logger.warn(
          {
            component: 'profiles/me',
            userId: user.id,
            contentLength,
            formKeys,
            avatarType: typeof avatarFile,
          },
          'Multipart profile update included avatar field but no file; rejecting to avoid silent avatar loss.',
        );
        return corsJson(req, { error: 'Avatar upload could not be parsed. Please retry.' }, { status: 400 }, AUTH_METHODS);
      }
      payload.logger?.info?.(
        {
          formKeys,
          hasAvatar: avatarFile instanceof File,
          avatarSize: avatarFile instanceof File ? avatarFile.size : null,
          avatarType: avatarFile instanceof File ? avatarFile.type : null,
        },
        'profiles/me form-data debug',
      );
      if (avatarFile instanceof File && avatarFile.size > 0) {
        newAvatar = await withTimeout(
          uploadAvatarToPayload(payload, avatarFile, user, localReq),
          'avatar upload',
          20_000,
        );
        if (newAvatar) {
          update.avatar = newAvatar.id as any;
          update.avatarUrl = newAvatar.url ?? null;
          update.avatarMediaType = newAvatar.mediaType;
        }
      }

      if (!newAvatar) {
        const explicitAvatarMediaType = normalizeAvatarMediaTypeInput(formData.get('avatarMediaType'));
        const avatarUrl = normalizeString(formData.get('avatarUrl'));
        if (avatarUrl !== null) {
          const resolved = resolveAvatarUrlUpdate(payload, avatarUrl);
          update.avatarUrl = resolved.url;
          update.avatarMediaType = deduceAvatarMediaType({
            mediaType: explicitAvatarMediaType ?? undefined,
            url: resolved.url,
          });
          if (!resolved.isInternal) {
            update.avatar = null;
          }
        } else if (formData.has('avatarUrl') && !previousAvatarId) {
          update.avatarUrl = null;
          update.avatarMediaType = explicitAvatarMediaType ?? 'image';
        } else if (explicitAvatarMediaType) {
          update.avatarMediaType = explicitAvatarMediaType;
        }
      }

      if (normalizeString(formData.get('avatarAction')) === 'remove') {
        avatarRemove = true;
      }
    } else {
      let body: Partial<Record<keyof UpdatableFields | 'avatarAction', unknown>> = {};
      try {
        body = await req.json();
      } catch (error) {
        return corsJson(req, { error: 'Invalid request body.' }, { status: 400 }, AUTH_METHODS);
      }

      for (const key of jsonKeys) {
        if (body[key] === undefined) continue;
        const value = body[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          const trimmed = value.trim();
          update[key] = (key === 'avatarUrl'
            ? (resolveAvatarUrlFromValue(payload, trimmed) ?? trimmed)
            : trimmed) as any;
        } else if (value === null) {
          update[key] = null as any;
        }
      }
      for (const key of adminPreferenceKeys) {
        if (body[key] === undefined) continue;
        update[key] = parseAdminModeFlag(body[key]);
      }

      if (typeof body.avatarUrl === 'string' && body.avatarUrl.trim().length > 0) {
        const trimmed = body.avatarUrl.trim();
        const resolved = resolveAvatarUrlUpdate(payload, trimmed);
        update.avatarUrl = resolved.url as any;
        update.avatarMediaType = deduceAvatarMediaType({
          mediaType: body.avatarMediaType,
          url: resolved.url,
        });
        if (!resolved.isInternal) {
          update.avatar = null;
        }
      } else if (body.avatarUrl === null && !previousAvatarId) {
        update.avatarUrl = null;
        if (body.avatarMediaType !== undefined) {
          update.avatarMediaType = normalizeAvatarMediaType(body.avatarMediaType) ?? 'image';
        }
      } else if (body.avatarMediaType !== undefined) {
        const normalizedAvatarType = normalizeAvatarMediaType(body.avatarMediaType);
        if (normalizedAvatarType) {
          update.avatarMediaType = normalizedAvatarType;
        }
      }

      if (typeof body.avatarAction === 'string' && body.avatarAction.toLowerCase() === 'remove') {
        avatarRemove = true;
      }
    }

    if (avatarRemove) {
      update.avatar = null;
      update.avatarUrl = null;
      update.avatarMediaType = 'image';
    }

    const hasAdminModeViewPreferenceUpdate = Object.prototype.hasOwnProperty.call(
      update,
      'adminModeViewPreference',
    );
    const hasAdminModeEditPreferenceUpdate = Object.prototype.hasOwnProperty.call(
      update,
      'adminModeEditPreference',
    );
    if (hasAdminModeViewPreferenceUpdate || hasAdminModeEditPreferenceUpdate) {
      const normalizedPreferences = resolveEffectiveAdminMode({
        role: user.role ?? null,
        adminViewRequested: hasAdminModeViewPreferenceUpdate
          ? update.adminModeViewPreference
          : (user as any).adminModeViewPreference,
        adminEditRequested: hasAdminModeEditPreferenceUpdate
          ? update.adminModeEditPreference
          : (user as any).adminModeEditPreference,
      });
      update.adminModeViewPreference = normalizedPreferences.adminViewEnabled;
      update.adminModeEditPreference = normalizedPreferences.adminEditEnabled;
    }

    if (Object.keys(update).length === 0) {
      if (newAvatar) {
        await deleteAvatarById(payload, newAvatar.id, localReq, {
          mode: 'force',
          reason: 'profile-avatar-upload-rollback',
        });
      }
      log('no updates provided');
      return corsJson(req, { error: 'No updates provided.' }, { status: 400 }, AUTH_METHODS);
    }

    log('updating payload', { fields: Object.keys(update) });
    const updated = await withTimeout(
      payload.update({
        collection: 'users',
        id: user.id,
        data: update,
        req: localReq,
      }),
      'profile update',
      20_000,
    );
    log('payload update complete');

    const keepAvatarId =
      'avatar' in update
        ? numericId(update.avatar)
        : numericId(previousAvatarId);

    const previousAvatarNumeric = numericId(previousAvatarId);
    if (previousAvatarNumeric && previousAvatarNumeric !== keepAvatarId) {
      try {
        await withTimeout(deleteAvatarIfUnused(payload, previousAvatarNumeric, localReq), 'avatar delete previous', 5_000);
      } catch (cleanupError) {
        payload.logger.warn(
          { err: cleanupError, userId: user.id, previousAvatarId: previousAvatarNumeric },
          'Previous avatar cleanup skipped due to timeout',
        );
      }
    }

    // Clean up unused avatars best-effort; do not block the request if it hangs.
    try {
      await withTimeout(cleanupUserAvatars(payload, user, keepAvatarId, localReq), 'avatar prune', 5_000);
    } catch (cleanupError) {
      payload.logger.warn({ err: cleanupError, userId: user.id }, 'Avatar cleanup skipped due to timeout');
    }

    log('returning success');
    const honorBadgeMediaByCode = await resolveHonorBadgeMediaByCode({
      payload: payload as any,
      users: [updated as User],
    });
    return corsJson(
      req,
      { profile: sanitizePrivateProfile(updated as User, { payload, honorBadgeMediaByCode }) },
      {},
      AUTH_METHODS,
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      markTimeout({ label: error.label, ms: error.ms });
      return corsJson(
        req,
        { error: 'Profile update is taking too long. Please retry shortly.' },
        { status: 503 },
        AUTH_METHODS,
      );
    }
    if (newAvatar) {
      await deleteAvatarById(payload, newAvatar.id, localReq, {
        mode: 'force',
        reason: 'profile-avatar-update-error-rollback',
      });
    }

    const message = error instanceof Error ? error.message : 'Unable to update profile.';
    payload.logger?.warn?.({ err: error, message, userId: user.id }, 'Profile update failed');
    log('returning error');
    return corsJson(req, { error: message }, { status: 400 }, AUTH_METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, AUTH_METHODS);
}
