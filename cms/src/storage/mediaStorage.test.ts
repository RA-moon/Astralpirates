import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CmsEnv } from '@astralpirates/shared/env';

const s3StorageMock = vi.fn();

vi.mock('@payloadcms/storage-s3', () => ({
  s3Storage: s3StorageMock,
}));

const makeCmsEnv = (provider: CmsEnv['media']['provider']): CmsEnv =>
  ({
    payloadSecret: 'secret',
    payloadServerUrl: 'https://cms.astralpirates.com',
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/astralpirates',
    neo4jUri: 'bolt://localhost:7687',
    neo4jUser: 'neo4j',
    neo4jPassword: 'neo4j',
    registerLinkBase: 'https://astralpirates.com/enlist/accept',
    frontendOrigin: 'https://astralpirates.com',
    smtp: {},
    messaging: {},
    media: {
      provider,
      baseUrl: 'https://artifact.astralpirates.com',
      s3: {
        endpoint: 'https://seaweed.internal',
        region: 'us-east-1',
        forcePathStyle: true,
        accessKeyId: 'access',
        secretAccessKey: 'secret',
      },
      buckets: {
        avatars: 'avatars',
        gallery: 'gallery',
        tasks: 'tasks',
        badges: 'badges',
        matrix: 'matrix-media',
        videos: 'videos',
        models: 'models',
        documents: 'documents',
      },
      defaults: {
        access: 'public',
        lifecycle: 'durable',
        retentionPolicy: 'rp-forever',
        signedUrlTtlSeconds: 300,
        enforceScan: true,
        requireQuarantineOnScanFailure: true,
      },
      limits: {
        maxUploadBytes: {
          avatar: 2 * 1024 * 1024,
          gallery: 25 * 1024 * 1024,
          taskAttachment: 25 * 1024 * 1024,
          badge: 2 * 1024 * 1024,
        },
        quotasBytes: {
          userDaily: 200 * 1024 * 1024,
          flightPlan: 2 * 1024 * 1024 * 1024,
        },
      },
    },
  }) satisfies CmsEnv;

describe('buildMediaStoragePlugins', () => {
  beforeEach(() => {
    s3StorageMock.mockReset();
    s3StorageMock.mockImplementation((options) => options as any);
    delete process.env.MEDIA_S3_INTERNAL_ENDPOINT;
    delete process.env.MEDIA_S3_ALLOW_ARTIFACT_DIRECT;
  });

  it('returns no plugins when provider is local', async () => {
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const plugins = buildMediaStoragePlugins(makeCmsEnv('local'));
    expect(plugins).toEqual([]);
    expect(s3StorageMock).not.toHaveBeenCalled();
  });

  it('uses MEDIA_BASE_URL + bucket for generated file URLs', async () => {
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const plugins = buildMediaStoragePlugins(makeCmsEnv('seaweedfs'));
    expect(plugins).toHaveLength(4);
    expect(s3StorageMock).toHaveBeenCalledTimes(4);

    const firstCall = s3StorageMock.mock.calls[0]?.[0] as any;
    const avatarCollection = firstCall.collections.avatars;
    expect(
      avatarCollection.generateFileURL({
        filename: 'pilot.jpg',
        prefix: 'profiles/42',
      }),
    ).toBe('https://artifact.astralpirates.com/avatars/profiles/42/pilot.jpg');
    expect(
      avatarCollection.generateFileURL({
        filename: null,
      }),
    ).toBe('https://artifact.astralpirates.com/avatars');
  });

  it('respects MEDIA_S3_INTERNAL_ENDPOINT override for artifact host config', async () => {
    process.env.MEDIA_S3_INTERNAL_ENDPOINT = 'http://seaweedfs:8333';
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const env = makeCmsEnv('seaweedfs');
    env.media.s3.endpoint = 'https://artifact.astralpirates.com/s3';

    buildMediaStoragePlugins(env);

    const firstCall = s3StorageMock.mock.calls[0]?.[0] as any;
    expect(firstCall.config.endpoint).toBe('http://seaweedfs:8333');
  });

  it('skips seaweed plugin for artifact endpoint when no internal override is provided', async () => {
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const env = makeCmsEnv('seaweedfs');
    env.media.s3.endpoint = 'https://artifact.astralpirates.com/s3';

    const plugins = buildMediaStoragePlugins(env);

    expect(plugins).toEqual([]);
    expect(s3StorageMock).not.toHaveBeenCalled();
  });

  it('treats quoted artifact endpoints as artifact host endpoints', async () => {
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const env = makeCmsEnv('seaweedfs');
    env.media.s3.endpoint = "'https://artifact.astralpirates.com/s3'";

    const plugins = buildMediaStoragePlugins(env);

    expect(plugins).toEqual([]);
    expect(s3StorageMock).not.toHaveBeenCalled();
  });

  it('uses configured artifact endpoint when direct artifact access is explicitly allowed', async () => {
    process.env.MEDIA_S3_ALLOW_ARTIFACT_DIRECT = 'true';
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const env = makeCmsEnv('seaweedfs');
    env.media.s3.endpoint = 'https://artifact.astralpirates.com/s3';

    buildMediaStoragePlugins(env);

    const firstCall = s3StorageMock.mock.calls[0]?.[0] as any;
    expect(firstCall.config.endpoint).toBe('https://artifact.astralpirates.com/s3');
  });

  it('strips wrapping quotes from configured endpoint values', async () => {
    process.env.MEDIA_S3_ALLOW_ARTIFACT_DIRECT = 'true';
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const env = makeCmsEnv('seaweedfs');
    env.media.s3.endpoint = "'https://seaweed.internal'";

    buildMediaStoragePlugins(env);

    const firstCall = s3StorageMock.mock.calls[0]?.[0] as any;
    expect(firstCall.config.endpoint).toBe('https://seaweed.internal');
  });

  it('uses configured endpoint when endpoint host is not artifact', async () => {
    const { buildMediaStoragePlugins } = await import('./mediaStorage');
    const env = makeCmsEnv('seaweedfs');
    env.media.s3.endpoint = 'https://seaweed.internal';

    buildMediaStoragePlugins(env);

    const firstCall = s3StorageMock.mock.calls[0]?.[0] as any;
    expect(firstCall.config.endpoint).toBe('https://seaweed.internal');
  });
});
