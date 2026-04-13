#!/usr/bin/env node

/**
 * Validates that the gallery upload contract matches runtime codec support.
 * This protects production from advertising file types the CMS runtime
 * cannot actually decode.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePath = path.join(projectRoot, 'cms', 'app', 'api', 'flight-plans', 'gallery-images', 'route.ts');
const galleryMediaPath = path.join(projectRoot, 'cms', 'src', 'storage', 'galleryMedia.ts');
const sharedGalleryMediaPath = path.join(projectRoot, 'shared', 'galleryMedia.ts');
const cmsPackagePath = path.join(projectRoot, 'cms', 'package.json');

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const info = (message) => {
  console.log(`• ${message}`);
};

const parseStringLiterals = (source) => Array.from(source.matchAll(/'([^']+)'/g), (entry) => entry[1]);

const parseLegacyAllowedMimeTypesFromRoute = (source) => {
  const match = source.match(/const ALLOWED_MIME_TYPES = new Set\(\[([\s\S]*?)\]\);/);
  return match ? parseStringLiterals(match[1]) : null;
};

const parseImageMimeTypesFromGalleryMedia = (source) => {
  const match = source.match(/const IMAGE_MIME_TYPES = \[([\s\S]*?)\]\s+as const;/);
  return match ? parseStringLiterals(match[1]) : null;
};

const parseImageMimeTypesFromSharedGalleryMedia = (source) => {
  const match = source.match(/export const GALLERY_IMAGE_MIME_TYPES = \[([\s\S]*?)\]\s+as const;/);
  return match ? parseStringLiterals(match[1]) : null;
};

const resolveImageMimeContract = () => {
  const routeSource = readFileSync(routePath, 'utf8');
  const legacyMimeTypes = parseLegacyAllowedMimeTypesFromRoute(routeSource);
  const candidateMimeTypes =
    legacyMimeTypes ??
    parseImageMimeTypesFromGalleryMedia(readFileSync(galleryMediaPath, 'utf8')) ??
    parseImageMimeTypesFromSharedGalleryMedia(readFileSync(sharedGalleryMediaPath, 'utf8'));

  if (!candidateMimeTypes?.length) {
    fail(
      'Unable to parse gallery image MIME types from cms/app/api/flight-plans/gallery-images/route.ts ' +
        'or cms/src/storage/galleryMedia.ts or shared/galleryMedia.ts.',
    );
  }

  const imageMimeTypes = Array.from(
    new Set(candidateMimeTypes.filter((mimeType) => mimeType.startsWith('image/'))),
  );
  if (!imageMimeTypes.length) {
    fail('Gallery upload contract did not expose any image MIME types.');
  }

  return imageMimeTypes;
};

const inferSharpInputSupport = (sharp) => {
  const formats = sharp.format ?? {};
  const heifSuffixes = new Set(
    (formats.heif?.input?.fileSuffix ?? []).map((value) => value.trim().toLowerCase()),
  );
  return {
    jpeg: Boolean(formats.jpeg?.input?.buffer),
    png: Boolean(formats.png?.input?.buffer),
    webp: Boolean(formats.webp?.input?.buffer),
    gif: Boolean(formats.gif?.input?.buffer),
    avif: heifSuffixes.has('.avif'),
    heic: heifSuffixes.has('.heic'),
    heif: heifSuffixes.has('.heif'),
    heifSuffixes: Array.from(heifSuffixes),
  };
};

const resolveHeifFixturePath = () => {
  const envPath = process.env.CMS_HEIF_FIXTURE_PATH?.trim();
  if (envPath) return path.resolve(envPath);
  const defaultFixture = path.join(projectRoot, 'cms', 'test', 'fixtures', 'heic-sample.heic');
  return existsSync(defaultFixture) ? defaultFixture : null;
};

const runDecodeProbes = async (sharp, allowedMimeTypes) => {
  const base = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 32, g: 80, b: 128 },
    },
  })
    .png()
    .toBuffer();

  const tinyGif = Buffer.from('R0lGODdhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  const sampleBuffers = {
    'image/jpeg': await sharp(base).jpeg().toBuffer(),
    'image/png': base,
    'image/webp': await sharp(base).webp().toBuffer(),
    'image/gif': tinyGif,
    'image/avif': await sharp(base).avif().toBuffer(),
  };

  for (const mimeType of allowedMimeTypes) {
    const candidate = sampleBuffers[mimeType];
    if (!candidate) {
      continue;
    }
    let metadata;
    try {
      metadata = await sharp(candidate).metadata();
    } catch (error) {
      fail(`Codec probe failed for ${mimeType}: ${error.message}`);
    }
    if (!metadata?.width || !metadata?.height) {
      fail(`Codec probe for ${mimeType} returned invalid dimensions.`);
    }
  }
};

const runHeifFixtureProbe = async (sharp) => {
  const fixturePath = resolveHeifFixturePath();
  if (!fixturePath) {
    fail(
      'Gallery upload allows HEIC/HEIF but no probe fixture was found. ' +
        'Set CMS_HEIF_FIXTURE_PATH or add cms/test/fixtures/heic-sample.heic.',
    );
  }

  let metadata;
  try {
    metadata = await sharp(fixturePath).metadata();
  } catch (error) {
    fail(`HEIC probe failed to decode fixture (${fixturePath}): ${error.message}`);
  }
  if (!metadata?.format || !['heif', 'heic'].includes(metadata.format)) {
    fail(
      `HEIC probe fixture decoded unexpectedly as "${metadata?.format ?? 'unknown'}" ` +
        `(${fixturePath}).`,
    );
  }

  try {
    await sharp(fixturePath).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch (error) {
    fail(`HEIC probe failed to transcode fixture (${fixturePath}): ${error.message}`);
  }
};

const main = async () => {
  const allowedMimeTypes = resolveImageMimeContract();

  const requireFromCms = createRequire(cmsPackagePath);
  const sharp = requireFromCms('sharp');
  const support = inferSharpInputSupport(sharp);

  const supportByMime = new Map([
    ['image/jpeg', support.jpeg],
    ['image/png', support.png],
    ['image/webp', support.webp],
    ['image/gif', support.gif],
    ['image/avif', support.avif],
    ['image/heic', support.heic],
    ['image/heif', support.heif],
  ]);

  for (const mimeType of allowedMimeTypes) {
    const supported = supportByMime.get(mimeType);
    if (!supported) {
      fail(`Gallery upload accepts ${mimeType} but sharp does not report decoder support for it.`);
    }
  }

  await runDecodeProbes(sharp, allowedMimeTypes);

  const allowsHeif = allowedMimeTypes.some((mimeType) => mimeType === 'image/heic' || mimeType === 'image/heif');
  if (allowsHeif) {
    await runHeifFixtureProbe(sharp);
  }

  info(`Gallery image MIME contract: ${allowedMimeTypes.join(', ')}`);
  info(`sharp HEIF suffix support: ${support.heifSuffixes.length ? support.heifSuffixes.join(', ') : '(none)'}`);
  console.log('✓ CMS media codec support matches gallery upload contract.');
};

await main();
