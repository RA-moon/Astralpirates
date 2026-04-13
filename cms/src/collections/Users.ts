import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeLoginHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';

import { CAPTAIN_ROLE, CREW_ROLE_OPTIONS, DEFAULT_CREW_ROLE } from '@astralpirates/shared/crewRoles';
import { AVATAR_MEDIA_TYPES, normalizeAvatarMediaType } from '@astralpirates/shared/avatarMedia';
import { makeProfileSlugFromCallSign, makeTemporaryProfileSlug } from '../utils/profileSlug';
import {
  getNeo4jDriver,
  upsertInviteEdge,
  removeInviteEdgesForUser,
  isNeo4jSyncDisabled,
} from '../utils/neo4j';
import { disableRedirect, recordRedirect } from '../services/profileSlugRedirects';
import {
  clearOwnerMediaReferences,
  queueMediaDelete,
  syncAvatarReferenceForUser,
  syncHonorBadgeReferencesForUser,
} from '../services/mediaLifecycle';
import { sanitizeCrewHtml } from '../utils/sanitizeHtml';
import { syncHonorBadges } from '../utils/honorBadges';

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveUserId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value !== null && 'id' in (value as Record<string, unknown>)) {
    return resolveUserId((value as Record<string, unknown>).id);
  }
  return null;
};

const SESSION_IDLE_TIMEOUT_SECONDS = parsePositiveInteger(
  process.env.PAYLOAD_SESSION_IDLE_TIMEOUT,
  60 * 60 * 12,
);

const MAX_ACTIVE_SESSIONS = parsePositiveInteger(process.env.PAYLOAD_MAX_ACTIVE_SESSIONS, 10);

const isBlank = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length === 0;
};

const normaliseIdentity = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
};

const normaliseEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  return trimmed;
};

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const sanitiseUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (error) {
    return null;
  }
};

const enforceImmutableIdentity: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
}) => {
  const next = { ...data } as Record<string, any>;

  if ('firstName' in next) {
    const normalised = normaliseIdentity(next.firstName);
    if (normalised !== null) next.firstName = normalised;
  }

  if ('lastName' in next) {
    const normalised = normaliseIdentity(next.lastName);
    if (normalised !== null) next.lastName = normalised;
  }

  if ('email' in next) {
    const normalised = normaliseEmail(next.email);
    if (normalised !== null) next.email = normalised;
  }

  if (operation === 'update' && originalDoc) {
    const prev = originalDoc as Record<string, any>;
    (['firstName', 'lastName', 'email'] as const).forEach((field) => {
      if (!(field in next)) return;
      const incoming = next[field];
      const previous = prev[field];
      if (isBlank(previous) && !isBlank(incoming)) {
        return;
      }
      if (isBlank(previous) && isBlank(incoming)) {
        next[field] = null;
        return;
      }
      if (incoming !== previous) {
        throw new Error(`${field === 'email' ? 'Email' : field === 'firstName' ? 'First name' : 'Surname'} cannot be changed after registration.`);
      }
    });
  }

  if (operation === 'create') {
    const firstName = normaliseIdentity(next.firstName);
    const lastName = normaliseIdentity(next.lastName);
    if (!firstName) {
      throw new Error('First name is required.');
    }
    if (!lastName) {
      throw new Error('Surname is required.');
    }
    next.firstName = firstName;
    next.lastName = lastName;
    const email = normaliseEmail(next.email);
    if (!email) {
      throw new Error('Email is required.');
    }
    next.email = email;
  }

  const resolveEffectiveField = (field: string): unknown => {
    if (field in next) {
      return next[field];
    }
    if (operation === 'update' && originalDoc) {
      return (originalDoc as Record<string, unknown>)[field];
    }
    return undefined;
  };

  const roleFrom = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  const hasMissingInviterForNonCaptain = (role: unknown, invitedBy: unknown): boolean => {
    const resolvedRole = roleFrom(role);
    if (resolvedRole === CAPTAIN_ROLE) {
      return false;
    }
    return resolveUserId(invitedBy) == null;
  };

  const nextRole = resolveEffectiveField('role');
  const nextInvitedBy = resolveEffectiveField('invitedBy');
  const invalidNextState = hasMissingInviterForNonCaptain(nextRole, nextInvitedBy);

  if (operation === 'create' && invalidNextState) {
    throw new Error('Invited by is required for all non-captain users.');
  }

  if (operation === 'update' && originalDoc && invalidNextState) {
    const previousRole = (originalDoc as Record<string, unknown>).role;
    const previousInvitedBy = (originalDoc as Record<string, unknown>).invitedBy;
    const wasPreviouslyInvalid = hasMissingInviterForNonCaptain(previousRole, previousInvitedBy);
    const roleChanged = 'role' in next && next.role !== previousRole;
    const invitedByTouched = 'invitedBy' in next;

    // Permit legacy rows to update unrelated fields until a dedicated backfill runs.
    if (!wasPreviouslyInvalid || roleChanged || invitedByTouched) {
      throw new Error('Invited by is required for all non-captain users.');
    }
  }

  return next;
};

const applyHonorBadges: CollectionBeforeChangeHook = async ({ data, originalDoc }) => {
  const next = { ...data };
  next.honorBadges = syncHonorBadges({
    draft: next,
    previous: (originalDoc as Record<string, unknown>) ?? null,
  });
  return next;
};

const prepareProfileIdentifiers: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  context,
  req,
}) => {
  if (context?.skipProfileSlugAssignment) return data;

  const next = { ...data } as Record<string, any>;

  const currentId =
    originalDoc && typeof originalDoc.id !== 'undefined'
      ? String(originalDoc.id)
      : undefined;
  const preserveRedirectTargetUserId = (() => {
    const parsed = Number.parseInt(currentId ?? '', 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  })();

  const incomingCallSignRaw = typeof next.callSign === 'string' ? next.callSign : undefined;
  const existingCallSignRaw = operation === 'update' ? (originalDoc?.callSign as string | undefined) : undefined;
  const resolvedCallSign = (incomingCallSignRaw ?? existingCallSignRaw ?? '').trim();

  if (incomingCallSignRaw !== undefined) {
    next.callSign = resolvedCallSign;
  }

  if (resolvedCallSign) {
    const slug = makeProfileSlugFromCallSign(resolvedCallSign);
    if (req?.payload) {
      await disableRedirect({
        targetSlug: slug,
        req,
        preserveTargetUserId: preserveRedirectTargetUserId,
      });
    }

    const existing = await req.payload.find({
      collection: 'users',
      where: {
        profileSlug: { equals: slug },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const conflicting = existing.docs.find((doc: { id?: string | number }) => {
      if (typeof doc?.id === 'undefined') return false;
      return String(doc.id) !== currentId;
    });
    if (conflicting) {
      throw new Error('Call sign is already claimed by another crew member.');
    }

    next.profileSlug = slug;
    return next;
  }

  if (operation === 'create') {
    next.profileSlug = next.profileSlug ?? makeTemporaryProfileSlug();
    return next;
  }

  if (!next.profileSlug && originalDoc?.profileSlug) {
    next.profileSlug = originalDoc.profileSlug as string;
    return next;
  }

  if (!next.profileSlug) {
    next.profileSlug = makeTemporaryProfileSlug();
  }

  return next;
};

const sanitiseProfileContent: CollectionBeforeValidateHook = async ({ data }) => {
  if (!data) return data;
  const next = { ...data } as Record<string, unknown>;

  if ('avatarMediaType' in next) {
    next.avatarMediaType = normalizeAvatarMediaType(next.avatarMediaType) ?? 'image';
  }

  if ('bio' in next) {
    const sanitized = sanitizeCrewHtml(typeof next.bio === 'string' ? next.bio : null);
    next.bio = sanitized;
  }

  if (Array.isArray(next.links)) {
    next.links = next.links
      .map((link: Record<string, unknown>) => {
        if (!link || typeof link !== 'object') return link;
        const cloned = { ...link } as Record<string, unknown>;
        if ('label' in cloned && typeof cloned.label === 'string') {
          const trimmedLabel = cloned.label.trim();
          if (!trimmedLabel) {
            delete cloned.label;
          } else {
            cloned.label = trimmedLabel;
          }
        }
        const rawUrl = typeof cloned.url === 'string' ? cloned.url : '';
        if (rawUrl) {
          const safeUrl = sanitiseUrl(rawUrl);
          if (!safeUrl) {
            throw new Error('Crew link URLs must start with http(s), mailto, or tel.');
          }
          cloned.url = safeUrl;
        }
        return cloned;
      })
      .filter((link) => {
        if (!link || typeof link !== 'object') return false;
        const url = (link as Record<string, unknown>).url;
        const label = (link as Record<string, unknown>).label;
        return typeof url === 'string' && url.length > 0 && typeof label === 'string' && label.trim().length > 0;
      });
  }

  return next;
};

const resolveAvatarId = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('id' in record) {
      return resolveAvatarId(record.id);
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const resolved = String(value).trim();
    return resolved.length > 0 ? resolved : null;
  }
  return null;
};

const resolveAvatarQueryValue = (avatarId: string): number | string => {
  const parsed = Number.parseInt(avatarId, 10);
  if (Number.isFinite(parsed) && String(parsed) === avatarId) return parsed;
  return avatarId;
};

const deleteAvatarSafely = async (avatarId: string | null, req: any) => {
  if (!avatarId) return;
  try {
    const numeric = resolveUserId(avatarId);
    if (numeric == null) return;
    await queueMediaDelete({
      payload: req.payload,
      assetClass: 'avatar',
      assetId: numeric,
      mode: 'safe',
      reason: 'user-avatar-replaced-or-pruned',
      requestedByUserId: resolveUserId((req.user as { id?: unknown } | null | undefined)?.id),
    });
  } catch (error) {
    const logger = req?.payload?.logger;
    if (logger && typeof logger.warn === 'function') {
      logger.warn(
        { avatarId, error },
        'Failed to remove previous avatar upload; manual cleanup may be required.',
      );
    } else {
      console.warn('[payload] failed to remove previous avatar upload', { avatarId, error });
    }
  }
};

const avatarInUseByOthers = async (
  avatarId: string,
  currentUserId: unknown,
  req: any,
): Promise<boolean> => {
  try {
    const queryAvatarId = resolveAvatarQueryValue(avatarId);
    const excludeId = resolveUserId(currentUserId);
    const where: Record<string, unknown> =
      excludeId == null
        ? { avatar: { equals: queryAvatarId } }
        : { and: [{ avatar: { equals: queryAvatarId } }, { id: { not_equals: excludeId } }] };

    const usage = await req.payload.find({
      collection: 'users',
      where,
      depth: 0,
      limit: 1,
      overrideAccess: true,
    });

    return Boolean(usage?.totalDocs && usage.totalDocs > 0);
  } catch (error) {
    const logger = req?.payload?.logger;
    if (logger && typeof logger.warn === 'function') {
      logger.warn(
        { avatarId, error },
        'Failed to check avatar usage; skipping deletion to avoid breaking references.',
      );
    } else {
      console.warn('[payload] failed to check avatar usage', { avatarId, error });
    }
    return true;
  }
};

const cleanupReplacedAvatar: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return;
  const previousAvatarId =
    resolveAvatarId(previousDoc?.avatar) ?? resolveAvatarId((previousDoc as any)?.avatar_id);
  if (!previousAvatarId) return;

  const nextAvatarId = resolveAvatarId(doc?.avatar);
  if (nextAvatarId && nextAvatarId === previousAvatarId) return;

  if (await avatarInUseByOthers(previousAvatarId, doc?.id, req)) return;
  void deleteAvatarSafely(previousAvatarId, req);
};

const syncUserAvatarReferenceLedger: CollectionAfterChangeHook = async ({ doc, req }) => {
  const userId = resolveUserId((doc as { id?: unknown } | null | undefined)?.id);
  if (userId == null) return doc;

  const actorUserId = resolveUserId((req.user as { id?: unknown } | null | undefined)?.id);

  // Avoid blocking the enclosing user update transaction on nested ledger writes.
  // The reconciler can heal drift if this best-effort sync fails.
  void syncAvatarReferenceForUser({
    payload: req.payload,
    userId,
    avatarId: resolveUserId((doc as { avatar?: unknown } | null | undefined)?.avatar),
    actorUserId,
  }).catch((error) => {
    req?.payload?.logger?.warn?.(
      { error, userId, actorUserId },
      'Failed to sync avatar media reference ledger after user change.',
    );
  });

  return doc;
};

const syncUserHonorBadgeReferenceLedger: CollectionAfterChangeHook = async ({ doc, req }) => {
  const userId = resolveUserId((doc as { id?: unknown } | null | undefined)?.id);
  if (userId == null) return doc;

  const actorUserId = resolveUserId((req.user as { id?: unknown } | null | undefined)?.id);

  void syncHonorBadgeReferencesForUser({
    payload: req.payload,
    userId,
    honorBadges: (doc as { honorBadges?: unknown } | null | undefined)?.honorBadges,
    actorUserId,
  }).catch((error) => {
    req?.payload?.logger?.warn?.(
      { error, userId, actorUserId },
      'Failed to sync honor badge media reference ledger after user change.',
    );
  });

  return doc;
};

const pruneAvatarOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const avatarId = resolveAvatarId(doc?.avatar) ?? resolveAvatarId((doc as any)?.avatar_id);
  if (!avatarId) return;
  if (await avatarInUseByOthers(avatarId, doc?.id, req)) return;
  void deleteAvatarSafely(avatarId, req);
};

const clearUserAvatarReferenceLedgerOnDelete: CollectionAfterDeleteHook = async ({
  doc,
  id,
  req,
}) => {
  const userId = resolveUserId((doc as { id?: unknown } | null | undefined)?.id ?? id);
  if (userId == null) return;

  await clearOwnerMediaReferences({
    payload: req.payload,
    assetClass: 'avatar',
    ownerType: 'user',
    ownerId: userId,
    fieldPath: 'avatar',
    actorUserId: resolveUserId((req.user as { id?: unknown } | null | undefined)?.id),
  });

  await clearOwnerMediaReferences({
    payload: req.payload,
    assetClass: 'badge',
    ownerType: 'user',
    ownerId: userId,
    fieldPath: 'honorBadges',
    actorUserId: resolveUserId((req.user as { id?: unknown } | null | undefined)?.id),
  });
};

const capActiveSessions: CollectionBeforeLoginHook = async ({ collection, req, user }) => {
  const { auth } = collection;
  if (!auth?.useSessions) return user;

  const sessions = Array.isArray(user.sessions) ? [...user.sessions] : [];
  if (MAX_ACTIVE_SESSIONS <= 0) return user;
  if (sessions.length <= MAX_ACTIVE_SESSIONS) return user;

  const nextSessions = sessions.slice(-MAX_ACTIVE_SESSIONS);
  const { _strategy, collection: _collection, ...persistableUser } = user;

  await req.payload.db.updateOne({
    collection: collection.slug,
    data: {
      ...persistableUser,
      sessions: nextSessions,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    id: user.id,
    req,
    returning: false,
  });

  return {
    ...user,
    sessions: nextSessions,
  };
};

const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: SESSION_IDLE_TIMEOUT_SECONDS,
    cookies: {
      secure: process.env.NODE_ENV === 'production',
    },
    forgotPassword: {
      generateEmailHTML: () =>
        '<p>Password reset emails are handled through the crew sign-in flow. Use the "Forgot password" action on astralpirates.com to issue a secure reset link.</p>',
    },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'firstName', 'lastName', 'role', 'updatedAt'],
  },
  access: {
    read: () => false,
  },
  hooks: {
    beforeValidate: [prepareProfileIdentifiers, sanitiseProfileContent],
    beforeChange: [enforceImmutableIdentity, applyHonorBadges],
    beforeLogin: [capActiveSessions],
    afterChange: [
      cleanupReplacedAvatar,
      syncUserAvatarReferenceLedger,
      syncUserHonorBadgeReferenceLedger,
      async ({ doc }) => {
        if (isNeo4jSyncDisabled()) return;
        if (doc == null) return;

        const inviterId = resolveUserId(doc.invitedBy);
        if (inviterId) {
          void upsertInviteEdge({
            inviterId,
            inviteeId: doc.id,
            inviteeProps: {
              profileSlug: doc.profileSlug ?? null,
              role: doc.role ?? null,
            },
          });
        } else {
          void removeInviteEdgesForUser(doc.id);
        }
      },
      async ({ doc, previousDoc, req }) => {
        const logger = req?.payload?.logger;
        const currentSlug =
          typeof doc?.profileSlug === 'string' ? doc.profileSlug.trim().toLowerCase() : null;
        const previousSlug =
          typeof previousDoc?.profileSlug === 'string' ? previousDoc.profileSlug.trim().toLowerCase() : null;

        if (!currentSlug || !req?.payload || !doc?.id) {
          return;
        }

        await disableRedirect({
          fromSlug: currentSlug,
          req,
          reason: 'profile-rename',
        });

        if (!previousSlug || previousSlug === currentSlug) {
          return;
        }

        try {
          await recordRedirect({
            fromSlug: previousSlug,
            toSlug: currentSlug,
            targetUserId: doc.id,
            reason: 'profile-rename',
            req,
          });
        } catch (error) {
          logger?.warn(
            {
              error,
              from: previousSlug,
              to: currentSlug,
              userId: doc.id,
            },
            'Failed to record profile slug redirect.',
          );
        }
      },
    ],
    afterDelete: [
      clearUserAvatarReferenceLedgerOnDelete,
      pruneAvatarOnDelete,
      async ({ doc }) => {
        if (!doc || isNeo4jSyncDisabled()) return;
        try {
          const driver = getNeo4jDriver();
          await driver.executeQuery(
            `MATCH (u:User {payloadId: $id})
             DETACH DELETE u`,
            { id: doc.id },
          );
        } catch (error) {
          console.warn('[neo4j] failed to remove user node', error);
        }
        await removeInviteEdgesForUser(doc.id);
      },
    ],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_CREW_ROLE,
      options: CREW_ROLE_OPTIONS.map((option) => ({ ...option })),
      admin: {
        position: 'sidebar',
        description: 'Determines access level within the crew portal.',
      },
    },
    {
      name: 'isTestUser',
      label: 'Test user',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Marks QA/seed accounts that are excluded from Crew Quarters listings and user/activity metrics.',
      },
    },
    {
      name: 'accountType',
      label: 'Account type',
      type: 'select',
      defaultValue: 'human',
      options: [
        { label: 'Human', value: 'human' },
        { label: 'Test', value: 'test' },
        { label: 'System', value: 'system' },
        { label: 'Integration', value: 'integration' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Canonical account classification used for long-term audience and metrics filtering.',
      },
    },
    {
      name: 'adminModeViewPreference',
      label: 'Admin visibility preference',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Preferred admin read mode (quartermaster+ only, clamped by role on authenticated API requests).',
      },
    },
    {
      name: 'adminModeEditPreference',
      label: 'Admin edit preference',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Preferred admin edit mode (captain only, requires admin visibility and is clamped by role).',
      },
    },
    {
      name: 'firstName',
      label: 'First name',
      type: 'text',
      required: true,
      admin: {
        description: 'Immutable after registration. Use for the crew roster only.',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.trim().length === 0) {
          return 'First name is required.';
        }
        return true;
      },
    },
    {
      name: 'lastName',
      label: 'Surname',
      type: 'text',
      required: true,
      admin: {
        description: 'Immutable after registration. Use for the crew roster only.',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.trim().length === 0) {
          return 'Surname is required.';
        }
        return true;
      },
    },
    {
      name: 'profileSlug',
      label: 'Profile slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Stable crew URL (auto-generated).',
        readOnly: true,
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.trim().length === 0) {
          return 'Slug is required.';
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Use lowercase letters, numbers, and hyphens only.';
        }
        return true;
      },
    },
    {
      name: 'callSign',
      label: 'Call sign',
      type: 'text',
      admin: {
        description: 'Crew nickname visible on the public profile.',
      },
    },
    {
      name: 'pronouns',
      type: 'text',
      admin: {
        description: 'Optional pronouns (e.g., they/them).',
      },
    },
    {
      name: 'avatar',
      label: 'Uploaded avatar',
      type: 'upload',
      relationTo: 'avatars',
      admin: {
        description: 'Crew portrait stored within Payload.',
      },
    },
    {
      name: 'avatarUrl',
      label: 'External avatar URL',
      type: 'text',
      admin: {
        description: 'Optional absolute URL used when no upload is provided.',
      },
      validate: (value: unknown) => {
        if (value == null || value === '') return true;
        if (typeof value !== 'string') return 'Avatar URL must be text.';
        return value.length <= 2048 ? true : 'Avatar URL must be 2048 characters or fewer.';
      },
    },
    {
      name: 'avatarMediaType',
      label: 'Avatar media type',
      type: 'select',
      defaultValue: 'image',
      options: AVATAR_MEDIA_TYPES.map((value) => ({
        value,
        label: value === 'model' ? '3D model' : value[0].toUpperCase() + value.slice(1),
      })),
      admin: {
        description: 'Explicit media mode used when an avatar URL points to non-image media.',
      },
    },
    {
      name: 'bio',
      type: 'textarea',
      admin: {
        rows: 6,
        description: 'Short biography shown on the profile page.',
      },
    },
    {
      name: 'lastActiveAt',
      label: 'Last active at',
      type: 'date',
      admin: {
        position: 'sidebar',
        description: 'Automatically updated when the crew member logs in or posts activity.',
        readOnly: true,
      },
    },
    {
      name: 'currentRoute',
      label: 'Last known route',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Automatically updated with the most recent page the crew member visited.',
        readOnly: true,
      },
    },
    {
      name: 'skills',
      type: 'array',
      admin: {
        description: 'Highlight key skills or specialisations.',
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'links',
      label: 'Crew links',
      type: 'array',
      admin: {
        description: 'Optional external links (portfolio, socials, etc.).',
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
          validate: (value: unknown) => {
            if (value == null || value === '') {
              return 'URL is required.';
            }
            const safe = sanitiseUrl(value);
            if (!safe) {
              return 'Enter a full URL starting with http(s), mailto, or tel.';
            }
            return true;
          },
        },
      ],
    },
    {
      name: 'honorBadges',
      label: 'Honor badges',
      type: 'array',
      defaultValue: [],
      admin: {
        description: 'Recognition automatically granted for key crew milestones.',
        readOnly: true,
      },
      access: {
        create: () => false,
        update: () => false,
      },
      fields: [
        {
          name: 'code',
          label: 'Badge code',
          type: 'text',
          required: true,
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'awardedAt',
          label: 'Awarded at',
          type: 'date',
          required: true,
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'source',
          label: 'Source',
          type: 'select',
          required: true,
          options: [
            { label: 'Automatic', value: 'automatic' },
            { label: 'Manual', value: 'manual' },
          ],
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'note',
          label: 'Note',
          type: 'textarea',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'elsaTokens',
      label: 'E.L.S.A. tokens',
      type: 'number',
      defaultValue: 0,
      min: 0,
      admin: {
        position: 'sidebar',
        description: 'ELSAT balance; managed automatically by invites + weekly refill.',
      },
      access: {
        create: () => false,
        update: () => false,
      },
    },
    {
      name: 'invite',
      label: 'Crew invite',
      type: 'group',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        description: 'Each crew member can invite one new pirate. Values are managed automatically.',
      },
      fields: [
        {
          name: 'purpose',
          label: 'Purpose',
          type: 'select',
          options: [
            { label: 'Recruit', value: 'recruit' },
            { label: 'Password reset', value: 'password_reset' },
          ],
          admin: {
            readOnly: true,
            description: 'Indicates how this invite slot is being used.',
          },
        },
        {
          name: 'targetUser',
          label: 'Target account',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            readOnly: true,
            description: 'Account the secure link affects (password resets only).',
          },
        },
        {
          name: 'firstName',
          label: 'Invited first name',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'lastName',
          label: 'Invited surname',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'email',
          label: 'Invited email',
          type: 'email',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'callSignSnapshot',
          label: 'Call sign snapshot',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'profileSlugSnapshot',
          label: 'Profile slug snapshot',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'tokenId',
          label: 'Registration token ID',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'token',
          label: 'Registration token',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'sentAt',
          label: 'Invite sent at',
          type: 'date',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'expiresAt',
          label: 'Invite expires at',
          type: 'date',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'redeemedAt',
          label: 'Invite redeemed at',
          type: 'date',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'invitedUser',
          label: 'Redeemed by',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'linkHidden',
          label: 'Link hidden',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            readOnly: true,
            description: 'Indicates whether the secure link is ever rendered in the UI.',
          },
        },
      ],
    },
    {
      name: 'invitedBy',
      label: 'Invited by',
      type: 'relationship',
      relationTo: 'users',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        description: 'Crew member who issued the invite for this pirate.',
        readOnly: true,
      },
    },
  ],
};

export default Users;
