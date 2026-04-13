import { s3Storage } from '@payloadcms/storage-s3';
import type { Plugin } from 'payload';
import type { CmsEnv } from '@astralpirates/shared/env';
import {
  isArtifactMediaHostname,
} from '@astralpirates/shared/mediaUrls';

type UploadCollectionSlug = 'avatars' | 'gallery-images' | 'task-attachments' | 'honor-badge-media';

type CollectionBucketBinding = {
  collection: UploadCollectionSlug;
  bucket: string;
  publicBaseUrl: string;
};

const toAcl = (access: CmsEnv['media']['defaults']['access']): 'private' | 'public-read' =>
  access === 'public' ? 'public-read' : 'private';

const stripSlashes = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/^\/+|\/+$/g, '') : '';

const joinUrl = (base: string, suffix: string): string => {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedSuffix = stripSlashes(suffix);
  if (!normalizedSuffix) {
    return normalizedBase;
  }
  return `${normalizedBase}/${normalizedSuffix}`;
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

const normalizeOptionalUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = trimWrappedQuotes(value.trim());
  return trimmed.length ? trimmed : null;
};

const isTruthy = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const resolveS3Endpoint = ({
  endpointValue,
}: {
  endpointValue: string | undefined;
}): string | null => {
  const endpoint = normalizeOptionalUrl(endpointValue);
  if (!endpoint) return null;

  const internalOverride = normalizeOptionalUrl(process.env.MEDIA_S3_INTERNAL_ENDPOINT);
  if (internalOverride) {
    return internalOverride;
  }

  const allowArtifactDirect = isTruthy(process.env.MEDIA_S3_ALLOW_ARTIFACT_DIRECT);
  if (isArtifactMediaHostname(endpoint)) {
    if (!allowArtifactDirect) return null;
  }

  return endpoint;
};

const buildStoragePlugin = ({
  env,
  collection,
  bucket,
  publicBaseUrl,
  }: {
  env: CmsEnv;
  collection: UploadCollectionSlug;
  bucket: string;
  publicBaseUrl: string;
}): Plugin | null => {
  const endpoint = resolveS3Endpoint({
    endpointValue: env.media.s3.endpoint,
  });
  const accessKeyId = env.media.s3.accessKeyId;
  const secretAccessKey = env.media.s3.secretAccessKey;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }

  return s3Storage({
    enabled: true,
    bucket,
    acl: toAcl(env.media.defaults.access),
    config: {
      endpoint,
      region: env.media.s3.region,
      forcePathStyle: env.media.s3.forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    },
    collections: {
      [collection]: {
        generateFileURL: ({ filename, prefix }: { filename?: string | null; prefix?: string }) => {
          const normalizedFilename = stripSlashes(filename);
          if (!normalizedFilename) {
            return publicBaseUrl;
          }
          const normalizedPrefix = stripSlashes(prefix);
          const objectKey = normalizedPrefix
            ? `${normalizedPrefix}/${normalizedFilename}`
            : normalizedFilename;
          return joinUrl(publicBaseUrl, objectKey);
        },
      },
    },
  });
};

export const buildMediaStoragePlugins = (env: CmsEnv): Plugin[] => {
  if (env.media.provider !== 'seaweedfs') {
    return [];
  }

  const bindings: CollectionBucketBinding[] = [
    {
      collection: 'avatars',
      bucket: env.media.buckets.avatars,
      publicBaseUrl: joinUrl(env.media.baseUrl, env.media.buckets.avatars),
    },
    {
      collection: 'gallery-images',
      bucket: env.media.buckets.gallery,
      publicBaseUrl: joinUrl(env.media.baseUrl, env.media.buckets.gallery),
    },
    {
      collection: 'task-attachments',
      bucket: env.media.buckets.tasks,
      publicBaseUrl: joinUrl(env.media.baseUrl, env.media.buckets.tasks),
    },
    {
      collection: 'honor-badge-media',
      bucket: env.media.buckets.badges,
      publicBaseUrl: joinUrl(env.media.baseUrl, env.media.buckets.badges),
    },
  ];

  return bindings
    .map((binding) =>
      buildStoragePlugin({
        env,
        collection: binding.collection,
        bucket: binding.bucket,
        publicBaseUrl: binding.publicBaseUrl,
      }),
    )
    .filter((plugin): plugin is Plugin => plugin != null);
};
