import { randomBytes } from 'node:crypto';
import path from 'path';

import type { CollectionConfig } from 'payload';

import { deriveOwnerToken } from '@astralpirates/shared/logs';
import { can } from '@astralpirates/shared/authorization';
import {
  AVATAR_ALLOWED_MIME_TYPES,
  resolveAvatarFilenameExtension,
} from '@astralpirates/shared/avatarMedia';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';
import { MEDIA_COLLECTION_CONFIG } from '../storage/mediaConfig';
import { slugify } from '../utils/profileSlug';

const avatarMediaConfig = MEDIA_COLLECTION_CONFIG.avatars;
const AVATAR_OBJECT_KEY_PREFIX = 'public/durable/clean/profile/user';
const AVATAR_RETENTION_SEGMENT = 'rp-forever';

const randomSuffix = (size = 5): string => randomBytes(size).toString('hex');

const sanitizeStem = (value: string | null | undefined, fallback: string): string => {
  if (!value) return fallback;
  const slug = slugify(value);
  return slug.length > 0 ? slug : fallback;
};

const resolveOwnerToken = (req: any): string => deriveOwnerToken(req?.user ?? null);

const resolveOwnerSegment = (req: any): string => {
  const ownerId = normaliseId(req?.user?.id);
  if (ownerId != null) {
    return String(ownerId);
  }
  return sanitizeStem(resolveOwnerToken(req), 'unknown');
};

const resolveUtcYearMonth = (date: Date): { year: string; month: string } => ({
  year: String(date.getUTCFullYear()),
  month: String(date.getUTCMonth() + 1).padStart(2, '0'),
});

export const formatAvatarFilename = ({
  originalFilename = 'avatar',
  req,
}: {
  originalFilename?: string;
  req?: any;
}) => {
  const ownerSegment = resolveOwnerSegment(req);
  const stem = sanitizeStem(path.basename(originalFilename, path.extname(originalFilename || 'avatar')), 'avatar');
  const ext = resolveAvatarFilenameExtension(originalFilename || '');
  const { year, month } = resolveUtcYearMonth(new Date());
  const unique = randomSuffix(8);
  return [
    AVATAR_OBJECT_KEY_PREFIX,
    ownerSegment,
    AVATAR_RETENTION_SEGMENT,
    year,
    month,
    `${stem}-${unique}-original${ext}`,
  ].join('/');
};

const canManageAvatar = ({ req, doc }: { req: any; doc?: any }) => {
  const user = req?.user ?? null;
  const ownerId = doc?.uploadedBy?.id ?? doc?.uploadedBy ?? null;
  return can('manageAvatar', {
    actor: {
      userId: user?.id ?? null,
      isAuthenticated: Boolean(user),
      websiteRole: user?.role ?? null,
    },
    owner: {
      userId: ownerId,
    },
  });
};

const Avatars: CollectionConfig = {
  slug: 'avatars',
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: canManageAvatar,
    delete: canManageAvatar,
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'filesize', 'width', 'height', 'updatedAt'],
    group: 'Media',
  },
  upload: {
    staticDir: avatarMediaConfig.staticDir,
    staticURL: avatarMediaConfig.staticURL,
    adminThumbnail: 'thumbnail',
    mimeTypes: Array.from(AVATAR_ALLOWED_MIME_TYPES),
    maxFileSize: avatarMediaConfig.maxFileSize,
    filename: formatAvatarFilename,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 160,
        height: 160,
      },
    ],
  } as any,
  fields: [
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

export default Avatars;
