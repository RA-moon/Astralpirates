import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import payload from 'payload';

import { listHonorBadgeDefinitions } from '@astralpirates/shared/honorBadges';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const BATCH_LIMIT = 1;

const normalizeIconPath = (value: string): string => value.replace(/^\/+/, '');

type BackfillOptions = {
  sourceDir: string | null;
  uploadedById: number | null;
};

const usage = (): void => {
  // eslint-disable-next-line no-console
  console.log(`Usage: pnpm --dir cms run badges:media:backfill -- [options]

Seeds upload-backed honor badge media from legacy static icon assets.

Options:
  --source-dir <path>        Optional root containing badge files (iconPath-relative).
                             Examples: frontend/public, /var/www/astralpirates/current
                             Env fallback: HONOR_BADGE_MEDIA_SOURCE_DIR
  --uploaded-by-id <id>      Optional user id stored in uploadedBy
  -h, --help                 Show help
`);
};

const parsePositiveInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[backfill-honor-badge-media] ${label} must be a positive integer, received "${value}".`);
  }
  return Math.trunc(parsed);
};

const parseArgs = (): BackfillOptions => {
  const args = process.argv.slice(2);
  let sourceDir: string | null = null;
  let uploadedById: number | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }

    if (arg === '--source-dir') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('[backfill-honor-badge-media] --source-dir requires a value.');
      }
      sourceDir = value;
      index += 1;
      continue;
    }

    if (arg === '--uploaded-by-id') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('[backfill-honor-badge-media] --uploaded-by-id requires a value.');
      }
      uploadedById = parsePositiveInteger(value, '--uploaded-by-id');
      index += 1;
      continue;
    }

    throw new Error(`[backfill-honor-badge-media] unknown argument: ${arg}`);
  }

  return {
    sourceDir,
    uploadedById,
  };
};

const resolveDirectoryCandidates = (options: BackfillOptions): string[] => {
  const candidates = [
    options.sourceDir,
    process.env.HONOR_BADGE_MEDIA_SOURCE_DIR,
    path.resolve(process.cwd(), '../frontend/public'),
    path.resolve(process.cwd(), 'frontend/public'),
    '/var/www/astralpirates/current',
    '/var/www/astralpirates',
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0)
    .map((value) => path.resolve(value));

  return Array.from(new Set(candidates));
};

const resolveMimeTypeFromFilename = (filename: string): string => {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.ogg':
    case '.ogv':
      return 'video/ogg';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.obj':
      return 'model/obj';
    case '.stl':
      return 'model/stl';
    case '.fbx':
      return 'model/vnd.fbx';
    case '.usdz':
      return 'model/vnd.usdz+zip';
    default:
      return 'application/octet-stream';
  }
};

const resolveBadgeMediaSourceDir = (options: BackfillOptions): string => {
  const candidates = resolveDirectoryCandidates(options);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(
    `[backfill-honor-badge-media] unable to resolve source directory; checked: ${candidates.join(', ') || '<none>'}`,
  );
};

const resolveCaptainUserId = async (): Promise<number> => {
  const captains = await payload.find({
    collection: 'users',
    where: {
      role: {
        equals: 'captain',
      },
    },
    depth: 0,
    limit: BATCH_LIMIT,
    overrideAccess: true,
  });

  const id = captains.docs[0]?.id;
  if (typeof id === 'number') {
    return id;
  }

  throw new Error(
    '[backfill-honor-badge-media] no captain user found; create a captain before running this backfill',
  );
};

const resolveUploadedByUserId = async (explicitUserId: number | null): Promise<number> => {
  if (explicitUserId == null) {
    return resolveCaptainUserId();
  }

  try {
    const user = await payload.findByID({
      collection: 'users',
      id: explicitUserId,
      depth: 0,
      overrideAccess: true,
    });
    if (typeof user?.id === 'number') {
      return user.id;
    }
  } catch {
    // handled below with deterministic error
  }

  throw new Error(
    `[backfill-honor-badge-media] --uploaded-by-id user not found: ${explicitUserId}`,
  );
};

const badgeMediaExists = async (badgeCode: string): Promise<boolean> => {
  const result = await payload.find({
    collection: 'honor-badge-media',
    where: {
      badgeCode: {
        equals: badgeCode,
      },
    },
    depth: 0,
    limit: BATCH_LIMIT,
    overrideAccess: true,
  });

  return result.docs.length > 0;
};

const run = async () => {
  const options = parseArgs();
  const payloadConfigModule = await import('../../payload.config.ts');
  await payload.init({ config: payloadConfigModule.default });

  const sourceDir = resolveBadgeMediaSourceDir(options);
  const uploadedBy = await resolveUploadedByUserId(options.uploadedById);

  let scanned = 0;
  let created = 0;
  let skippedExisting = 0;
  let skippedMissingSource = 0;

  for (const definition of listHonorBadgeDefinitions()) {
    scanned += 1;
    const iconPath = normalizeIconPath(definition.iconPath);
    if (!iconPath) {
      skippedMissingSource += 1;
      payload.logger.warn(
        { badgeCode: definition.code },
        '[backfill-honor-badge-media] skipping badge with empty iconPath',
      );
      continue;
    }

    const exists = await badgeMediaExists(definition.code);
    if (exists) {
      skippedExisting += 1;
      continue;
    }

    const sourcePath = path.resolve(sourceDir, iconPath);
    if (!fs.existsSync(sourcePath)) {
      skippedMissingSource += 1;
      payload.logger.warn(
        { badgeCode: definition.code, sourcePath },
        '[backfill-honor-badge-media] source file missing; skipping badge media seed',
      );
      continue;
    }

    const fileBuffer = await fsp.readFile(sourcePath);
    const filename = path.basename(sourcePath);
    const mimeType = resolveMimeTypeFromFilename(filename);

    await payload.create({
      collection: 'honor-badge-media',
      data: {
        badgeCode: definition.code,
        alt: `${definition.label} honor badge`,
        uploadedBy,
      },
      file: {
        data: fileBuffer,
        mimetype: mimeType,
        size: fileBuffer.byteLength,
        name: filename,
        originalname: filename,
        fieldname: 'file',
      },
      overrideAccess: true,
    });

    created += 1;
  }

  payload.logger.info(
    {
      scanned,
      created,
      skippedExisting,
      skippedMissingSource,
      sourceDir,
      uploadedBy,
    },
    '[backfill-honor-badge-media] complete',
  );

  await closePayloadLifecycle(payload);

  process.exit(0);
};

run().catch(async (error) => {
  console.error(error);
  await closePayloadLifecycle(payload);
  process.exit(1);
});
