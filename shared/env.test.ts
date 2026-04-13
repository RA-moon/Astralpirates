import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveCmsEnv, resolveFrontendEnv } from './env';

test('resolveFrontendEnv accepts provided API bases in production', () => {
  const env = {
    NODE_ENV: 'production',
    ASTRAL_API_BASE: 'https://api.example.com',
  };

  const result = resolveFrontendEnv({ env });

  assert.equal(result.astralApiBase, 'https://api.example.com');
  assert.equal(result.publicAstralApiBase, 'https://api.example.com');
});

test('resolveFrontendEnv rejects missing API bases by default in production', () => {
  const env = {
    NODE_ENV: 'production',
  };

  assert.throws(() => resolveFrontendEnv({ env }), /Invalid frontend configuration/);
});

test('resolveFrontendEnv can skip prod validation when explicitly disabled', () => {
  const env = {
    NODE_ENV: 'production',
    NUXT_VALIDATE_PROD: 'false',
  };

  const result = resolveFrontendEnv({ env });

  assert.equal(result.astralApiBase, 'http://localhost:3000');
  assert.equal(result.publicAstralApiBase, 'http://localhost:3000');
});

test('resolveCmsEnv derives defaults from the frontend origin', () => {
  const env = {
    NODE_ENV: 'development',
    FRONTEND_ORIGIN: 'http://localhost:8080',
    PAYLOAD_PUBLIC_SERVER_URL: 'http://localhost:3000',
  };

  const result = resolveCmsEnv({ env });

  assert.equal(result.frontendOrigin, 'http://localhost:8080');
  assert.equal(result.registerLinkBase, 'http://localhost:8080/enlist/accept');
  assert.equal(result.media.provider, 'local');
  assert.equal(result.media.baseUrl, 'http://localhost:3000/media');
  assert.equal(result.media.buckets.avatars, 'avatars');
  assert.equal(result.media.buckets.badges, 'badges');
  assert.equal(result.media.limits.maxUploadBytes.badge, 2 * 1024 * 1024);
  assert.equal(result.media.defaults.signedUrlTtlSeconds, 300);
});

test('resolveCmsEnv requires SMTP credentials when a host is set', () => {
  const env = {
    NODE_ENV: 'development',
    SMTP_HOST: 'smtp.example.com',
  };

  assert.throws(() => resolveCmsEnv({ env }), /SMTP_USER/);
});

test('resolveCmsEnv requires SMTP settings in production', () => {
  const env = {
    NODE_ENV: 'production',
    PAYLOAD_SECRET: 'secret',
    PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
    DATABASE_URL: 'postgres://user:pass@db:5432/astralpirates',
    NEO4J_URI: 'bolt://neo4j:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'secret',
    FRONTEND_ORIGIN: 'https://astralpirates.com',
    REGISTER_LINK_BASE: 'https://astralpirates.com/enlist/accept',
  };

  assert.throws(() => resolveCmsEnv({ env }), /SMTP_HOST/);
});

test('resolveCmsEnv requires SeaweedFS connection vars when provider is seaweedfs', () => {
  const env = {
    NODE_ENV: 'development',
    MEDIA_STORAGE_PROVIDER: 'seaweedfs',
  };

  assert.throws(() => resolveCmsEnv({ env }), /MEDIA_S3_ENDPOINT/);
});

test('resolveCmsEnv requires MEDIA_BUCKET_BADGES when provider is seaweedfs', () => {
  const env = {
    NODE_ENV: 'production',
    PAYLOAD_SECRET: 'secret',
    PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
    DATABASE_URL: 'postgres://user:pass@db:5432/astralpirates',
    NEO4J_URI: 'bolt://neo4j:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'secret',
    FRONTEND_ORIGIN: 'https://astralpirates.com',
    REGISTER_LINK_BASE: 'https://astralpirates.com/enlist/accept',
    MEDIA_STORAGE_PROVIDER: 'seaweedfs',
    MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
    MEDIA_S3_ENDPOINT: 'https://artifact.astralpirates.com/s3',
    MEDIA_S3_ACCESS_KEY_ID: 'access-key',
    MEDIA_S3_SECRET_ACCESS_KEY: 'secret-key',
    MEDIA_BUCKET_AVATARS: 'ap-avatars',
    MEDIA_BUCKET_GALLERY: 'ap-gallery',
    MEDIA_BUCKET_TASKS: 'ap-tasks',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'apikey',
    SMTP_PASSWORD: 'secret',
  };

  assert.throws(() => resolveCmsEnv({ env }), /MEDIA_BUCKET_BADGES/);
});

test('resolveCmsEnv accepts SeaweedFS settings and custom bucket names', () => {
  const env = {
    NODE_ENV: 'production',
    PAYLOAD_SECRET: 'secret',
    PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.astralpirates.com',
    DATABASE_URL: 'postgres://user:pass@db:5432/astralpirates',
    NEO4J_URI: 'bolt://neo4j:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'secret',
    FRONTEND_ORIGIN: 'https://astralpirates.com',
    REGISTER_LINK_BASE: 'https://astralpirates.com/enlist/accept',
    MEDIA_STORAGE_PROVIDER: 'seaweedfs',
    MEDIA_BASE_URL: 'https://artifact.astralpirates.com',
    MEDIA_S3_ENDPOINT: 'https://artifact.astralpirates.com/s3',
    MEDIA_S3_ACCESS_KEY_ID: 'access-key',
    MEDIA_S3_SECRET_ACCESS_KEY: 'secret-key',
    MEDIA_BUCKET_AVATARS: 'ap-avatars',
    MEDIA_BUCKET_GALLERY: 'ap-gallery',
    MEDIA_BUCKET_TASKS: 'ap-tasks',
    MEDIA_BUCKET_BADGES: 'ap-badges',
    MEDIA_DEFAULT_ACCESS: 'private',
    MEDIA_SIGNED_URL_TTL_SECONDS: '900',
    MEDIA_MAX_UPLOAD_BADGE_BYTES: '3145728',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'apikey',
    SMTP_PASSWORD: 'secret',
  };

  const result = resolveCmsEnv({ env });

  assert.equal(result.media.provider, 'seaweedfs');
  assert.equal(result.media.baseUrl, 'https://artifact.astralpirates.com');
  assert.equal(result.media.buckets.avatars, 'ap-avatars');
  assert.equal(result.media.buckets.gallery, 'ap-gallery');
  assert.equal(result.media.buckets.badges, 'ap-badges');
  assert.equal(result.media.limits.maxUploadBytes.badge, 3 * 1024 * 1024);
  assert.equal(result.media.defaults.access, 'private');
  assert.equal(result.media.defaults.signedUrlTtlSeconds, 900);
});
