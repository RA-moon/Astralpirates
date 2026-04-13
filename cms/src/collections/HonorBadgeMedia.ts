import { randomBytes } from 'node:crypto';
import path from 'node:path';

import type { CollectionConfig } from 'payload';

import { AVATAR_ALLOWED_MIME_TYPES, resolveAvatarFilenameExtension } from '@astralpirates/shared/avatarMedia';
import { HONOR_BADGE_CODE_VALUES } from '@astralpirates/shared/honorBadges';
import { can } from '@astralpirates/shared/authorization';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';
import { MEDIA_COLLECTION_CONFIG } from '../storage/mediaConfig';

const honorBadgeMediaConfig = MEDIA_COLLECTION_CONFIG.badges;

const randomSuffix = (size = 6): string => randomBytes(size).toString('hex');

const sanitizeStem = (value: string | null | undefined, fallback: string): string => {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback;
};

const HONOR_BADGE_ALLOWED_MIME_TYPES = Array.from(
  new Set<string>([...AVATAR_ALLOWED_MIME_TYPES, 'image/svg+xml']),
);

const resolveHonorBadgeFilenameExtension = (filenameValue: string): string => {
  const ext = path.extname(filenameValue || '').toLowerCase();
  if (ext === '.svg') return '.svg';
  return resolveAvatarFilenameExtension(filenameValue || '');
};

const formatHonorBadgeFilename = ({
  originalFilename = 'badge',
  data,
}: {
  originalFilename?: string;
  data?: Record<string, unknown>;
}) => {
  const badgeCode =
    typeof data?.badgeCode === 'string' && data.badgeCode.trim().length > 0
      ? data.badgeCode.trim().toLowerCase()
      : 'badge';
  const stem = sanitizeStem(path.basename(originalFilename, path.extname(originalFilename)), 'asset');
  const ext = resolveHonorBadgeFilenameExtension(originalFilename);
  return `badge-${badgeCode}-${stem}-${randomSuffix()}${ext}`;
};

const canManageHonorBadgeMedia = ({ req }: { req: any }): boolean =>
  can('manageHonorBadgeMedia', {
    actor: {
      userId: req?.user?.id ?? null,
      isAuthenticated: Boolean(req?.user),
      websiteRole: req?.user?.role ?? null,
    },
  });

const HonorBadgeMedia: CollectionConfig = {
  slug: 'honor-badge-media',
  access: {
    read: () => true,
    create: canManageHonorBadgeMedia,
    update: canManageHonorBadgeMedia,
    delete: canManageHonorBadgeMedia,
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['badgeCode', 'filename', 'mimeType', 'updatedAt'],
    group: 'Media',
    description: 'Upload-backed media assets for honor badges.',
  },
  upload: {
    staticDir: honorBadgeMediaConfig.staticDir,
    staticURL: honorBadgeMediaConfig.staticURL,
    adminThumbnail: 'thumbnail',
    mimeTypes: HONOR_BADGE_ALLOWED_MIME_TYPES,
    maxFileSize: honorBadgeMediaConfig.maxFileSize,
    filename: formatHonorBadgeFilename,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 320,
        height: 320,
      },
    ],
  } as any,
  fields: [
    {
      name: 'badgeCode',
      type: 'select',
      required: true,
      unique: true,
      options: HONOR_BADGE_CODE_VALUES.map((code) => ({
        label: code,
        value: code,
      })),
      admin: {
        description: 'Honor badge code this media asset is attached to.',
      },
    },
    {
      name: 'alt',
      type: 'text',
      required: false,
      admin: {
        description: 'Optional descriptive text for assistive technologies.',
      },
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        const next = { ...(data ?? {}) };
        const existingUploadedBy = normaliseId(
          (originalDoc as { uploadedBy?: unknown } | undefined)?.uploadedBy,
        );
        if (operation === 'update' && existingUploadedBy != null) {
          next.uploadedBy = existingUploadedBy;
        } else if (req.user) {
          next.uploadedBy = req.user.id;
        }
        return next;
      },
    ],
  },
};

export default HonorBadgeMedia;
