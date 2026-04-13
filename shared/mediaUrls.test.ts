import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARTIFACT_MEDIA_HOSTNAME,
  AVATAR_MEDIA_SOURCE_PREFIXES,
  buildGalleryCanonicalModeStartupWarning,
  CMS_MEDIA_HOSTNAME,
  GALLERY_REWRITE_FALLBACK_HOSTNAMES,
  GALLERY_MEDIA_SOURCE_PREFIXES,
  HONOR_BADGE_MEDIA_SOURCE_PREFIXES,
  isMissingMediaImageFallbackMode,
  isArtifactMediaHostname,
  isGalleryRewriteFallbackHostname,
  isKnownInternalMediaHostname,
  isSingleLabelHostname,
  MEDIA_DEFAULT_BUCKETS,
  MEDIA_MISSING_FALLBACK_QUERY_KEY,
  MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE,
  resolveMediaBucketName,
  resolveMissingMediaFallbackMode,
  shouldTreatHostnameAsInternalMedia,
} from './mediaUrls';

test('media hostname helpers classify known and single-label internal hosts', () => {
  assert.equal(isKnownInternalMediaHostname('cms.astralpirates.com'), true);
  assert.equal(isKnownInternalMediaHostname('https://cms.astralpirates.com/s3'), true);
  assert.equal(isKnownInternalMediaHostname('example.com'), false);
  assert.equal(isKnownInternalMediaHostname('https://example.com/media/file.jpg'), false);
  assert.equal(isArtifactMediaHostname('artifact.astralpirates.com'), true);
  assert.equal(isArtifactMediaHostname('https://artifact.astralpirates.com/s3'), true);
  assert.equal(isArtifactMediaHostname('https://example.com/s3'), false);
  assert.equal(ARTIFACT_MEDIA_HOSTNAME, 'artifact.astralpirates.com');
  assert.equal(CMS_MEDIA_HOSTNAME, 'cms.astralpirates.com');
  assert.equal(isGalleryRewriteFallbackHostname('cms.astralpirates.com'), true);
  assert.equal(isGalleryRewriteFallbackHostname('https://artifact.astralpirates.com/s3'), true);
  assert.equal(isGalleryRewriteFallbackHostname('https://astralpirates.com/media/foo.png'), false);
  assert.deepEqual(GALLERY_REWRITE_FALLBACK_HOSTNAMES, [
    'cms.astralpirates.com',
    'artifact.astralpirates.com',
  ]);
  assert.equal(isSingleLabelHostname('cms'), true);
  assert.equal(isSingleLabelHostname('media.example.com'), false);
  assert.equal(shouldTreatHostnameAsInternalMedia('artifact.astralpirates.com'), true);
  assert.equal(shouldTreatHostnameAsInternalMedia('cms'), true);
  assert.equal(shouldTreatHostnameAsInternalMedia('example.com'), false);
});

test('gallery canonical mode startup warning detects proxy host drift in seaweed mode', () => {
  const warning = buildGalleryCanonicalModeStartupWarning({
    mediaProvider: 'seaweedfs',
    mediaBaseUrl: 'https://artifact.astralpirates.com',
    payloadServerUrl: 'https://cms.astralpirates.com',
  });
  assert.equal(
    warning,
    '[media-hostname-resilience] Canonical gallery mode "proxy" expects same-origin proxy URLs (/api/gallery-images/file/*), but MEDIA_BASE_URL host (artifact.astralpirates.com) differs from PAYLOAD_PUBLIC_SERVER_URL host (cms.astralpirates.com).',
  );

  assert.equal(
    buildGalleryCanonicalModeStartupWarning({
      mediaProvider: 'local',
      mediaBaseUrl: 'http://localhost:3000/media',
      payloadServerUrl: 'http://localhost:3000',
    }),
    null,
  );
  assert.equal(
    buildGalleryCanonicalModeStartupWarning({
      mediaProvider: 'seaweedfs',
      mediaBaseUrl: 'https://artifact.astralpirates.com',
      payloadServerUrl: 'https://cms.astralpirates.com',
      canonicalMode: 'direct',
    }),
    null,
  );
  assert.equal(
    buildGalleryCanonicalModeStartupWarning({
      mediaProvider: 'seaweedfs',
      mediaBaseUrl: 'https://cms.astralpirates.com/media',
      payloadServerUrl: 'https://cms.astralpirates.com',
    }),
    null,
  );
});

test('media source prefix exports keep proxy and legacy compatibility paths', () => {
  assert.deepEqual(AVATAR_MEDIA_SOURCE_PREFIXES, [
    '/api/avatars/file/',
    '/media/avatars/',
    '/avatars/',
  ]);
  assert.deepEqual(GALLERY_MEDIA_SOURCE_PREFIXES, [
    '/api/gallery-images/file/',
    '/media/gallery/',
    '/gallery/',
  ]);
  assert.deepEqual(HONOR_BADGE_MEDIA_SOURCE_PREFIXES, [
    '/api/honor-badge-media/file/',
    '/media/badges/',
    '/badges/',
  ]);
});

test('missing-media fallback helpers resolve and match canonical image mode', () => {
  assert.equal(MEDIA_MISSING_FALLBACK_QUERY_KEY, 'fallback');
  assert.equal(MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE, 'image');
  assert.equal(resolveMissingMediaFallbackMode(new URLSearchParams('fallback=image')), 'image');
  assert.equal(resolveMissingMediaFallbackMode(new URLSearchParams('fallback=IMAGE')), 'image');
  assert.equal(resolveMissingMediaFallbackMode(new URLSearchParams('fallback=')), null);
  assert.equal(resolveMissingMediaFallbackMode(new URLSearchParams('other=value')), null);
  assert.equal(isMissingMediaImageFallbackMode('image'), true);
  assert.equal(isMissingMediaImageFallbackMode('IMAGE'), true);
  assert.equal(isMissingMediaImageFallbackMode('video'), false);
});

test('media bucket helpers normalize and resolve defaults', () => {
  assert.equal(resolveMediaBucketName('avatars', 'fallback'), 'avatars');
  assert.equal(resolveMediaBucketName('/gallery/', 'fallback'), 'gallery');
  assert.equal(resolveMediaBucketName('   ', 'fallback'), 'fallback');
  assert.equal(resolveMediaBucketName(undefined, MEDIA_DEFAULT_BUCKETS.tasks), 'tasks');
  assert.deepEqual(MEDIA_DEFAULT_BUCKETS, {
    avatars: 'avatars',
    gallery: 'gallery',
    tasks: 'tasks',
    badges: 'badges',
    matrix: 'matrix-media',
    videos: 'videos',
    models: 'models',
    documents: 'documents',
  });
});
