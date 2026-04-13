#!/usr/bin/env node

import process from 'node:process';
import { applyReportCliArgs } from './lib/report-cli-options.mjs';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_PAGE_ID = 1;
const DEFAULT_FLIGHT_PLAN_ID = 1;
const DEFAULT_TIMEOUT_MS = 45_000;
const GALLERY_FILE_PROXY_PREFIX = '/api/gallery-images/file/';

const usage = () => {
  console.log(`Usage: node scripts/check-gallery-upload-auth.mjs [options]

Authenticates against /api/auth/login and uploads tiny media probes to both
/api/pages/gallery-images and /api/flight-plans/gallery-images.

Options:
  --base <url>                  Base URL (default: ${DEFAULT_BASE_URL})
  --email <email>               Login email (or env GALLERY_UPLOAD_PROBE_EMAIL)
  --password <password>         Login password (or env GALLERY_UPLOAD_PROBE_PASSWORD)
  --page-id <id>                Page id for page upload probe (default: ${DEFAULT_PAGE_ID})
  --flight-plan-id <id>         Flight plan id for mission upload probe (default: ${DEFAULT_FLIGHT_PLAN_ID})
  --probe-types <csv>           Probe types to run: image,video,model (default: image,video,model)
  --timeout-ms <ms>             Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --keep-assets                 Skip delete cleanup after upload/read checks
  -h, --help                    Show this help
`);
};

const asPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseArgs = () => {
  const options = {
    base: process.env.GALLERY_UPLOAD_PROBE_BASE_URL || DEFAULT_BASE_URL,
    email: process.env.GALLERY_UPLOAD_PROBE_EMAIL || '',
    password: process.env.GALLERY_UPLOAD_PROBE_PASSWORD || '',
    pageId: asPositiveInt(process.env.GALLERY_UPLOAD_PROBE_PAGE_ID, DEFAULT_PAGE_ID),
    flightPlanId: asPositiveInt(
      process.env.GALLERY_UPLOAD_PROBE_FLIGHT_PLAN_ID,
      DEFAULT_FLIGHT_PLAN_ID,
    ),
    probeTypes: process.env.GALLERY_UPLOAD_PROBE_TYPES || 'image,video,model',
    timeoutMs: asPositiveInt(process.env.GALLERY_UPLOAD_PROBE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    keepAssets: false,
  };

  const { helpRequested } = applyReportCliArgs({
    argv: process.argv.slice(2),
    options,
    valueFlags: {
      '--base': 'base',
      '--email': 'email',
      '--password': 'password',
      '--page-id': 'pageId',
      '--flight-plan-id': 'flightPlanId',
      '--timeout-ms': 'timeoutMs',
      '--probe-types': 'probeTypes',
    },
    booleanFlags: {
      '--keep-assets': 'keepAssets',
    },
    strictUnknown: true,
  });

  if (helpRequested) {
    usage();
    process.exit(0);
  }

  options.pageId = asPositiveInt(options.pageId, DEFAULT_PAGE_ID);
  options.flightPlanId = asPositiveInt(options.flightPlanId, DEFAULT_FLIGHT_PLAN_ID);
  options.timeoutMs = asPositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);

  if (!options.email.trim() || !options.password) {
    throw new Error(
      'Upload probe requires email and password (use --email/--password or GALLERY_UPLOAD_PROBE_EMAIL/PASSWORD).',
    );
  }

  options.probeTypes = parseProbeTypes(options.probeTypes);

  return options;
};

const withTimeout = async (requestFactory, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await requestFactory(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const safeJson = async (response) => {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

const extractErrorMessage = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const direct =
    typeof payload.error === 'string'
      ? payload.error.trim()
      : typeof payload.message === 'string'
        ? payload.message.trim()
        : '';
  if (direct) return direct;
  const nestedErrors = Array.isArray(payload.errors) ? payload.errors : [];
  for (const entry of nestedErrors) {
    if (entry && typeof entry.message === 'string' && entry.message.trim().length > 0) {
      return entry.message.trim();
    }
  }
  return '';
};

const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const PROBE_IMAGE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9p8YQAAAAASUVORK5CYII=',
  'base64',
);

const PROBE_VIDEO_BYTES = Buffer.from('astral-probe-video');
const PROBE_MODEL_BYTES = Buffer.from('676c5446020000000c000000', 'hex');

const PROBE_VARIANTS = [
  {
    key: 'image',
    filename: 'upload-probe.png',
    mimeType: 'image/png',
    bytes: PROBE_IMAGE_BYTES,
    acceptHeader: 'image/*,*/*',
  },
  {
    key: 'video',
    filename: 'upload-probe.mp4',
    mimeType: 'video/mp4',
    bytes: PROBE_VIDEO_BYTES,
    acceptHeader: 'video/*,*/*',
  },
  {
    key: 'model',
    filename: 'upload-probe.glb',
    mimeType: 'model/gltf-binary',
    bytes: PROBE_MODEL_BYTES,
    acceptHeader: 'model/*,*/*',
  },
];

const PROBE_VARIANTS_BY_KEY = new Map(PROBE_VARIANTS.map((variant) => [variant.key, variant]));

const parseProbeTypes = (value) => {
  const selected = String(value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const normalized = selected.length > 0 ? selected : ['image', 'video', 'model'];
  const invalid = normalized.filter((entry) => !PROBE_VARIANTS_BY_KEY.has(entry));
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported --probe-types value(s): ${invalid.join(', ')}. Expected comma-separated values from: image,video,model.`,
    );
  }

  return Array.from(new Set(normalized));
};

const buildProbeFormData = (idField, idValue, variant) => {
  const formData = new FormData();
  formData.append(idField, String(idValue));
  formData.append(
    'file',
    new Blob([variant.bytes], { type: variant.mimeType }),
    variant.filename,
  );
  return formData;
};

const isCanonicalGalleryProxyUrl = (value, baseUrl) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, baseUrl);
    return parsed.pathname.startsWith(GALLERY_FILE_PROXY_PREFIX);
  } catch {
    return false;
  }
};

const uploadProbe = async ({
  name,
  url,
  baseUrl,
  token,
  idField,
  idValue,
  variant,
  timeoutMs,
}) => {
  const response = await withTimeout(
    (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: buildProbeFormData(idField, idValue, variant),
        signal,
      }),
    timeoutMs,
  );

  const payload = await safeJson(response);
  if (response.status !== 201) {
    const message = extractErrorMessage(payload);
    throw new Error(
      `[${name}] expected 201, received ${response.status}${message ? ` (${message})` : ''}`,
    );
  }

  const uploadAssetId =
    payload &&
    typeof payload === 'object' &&
    payload.upload &&
    typeof payload.upload === 'object' &&
    payload.upload.asset &&
    typeof payload.upload.asset === 'object'
      ? payload.upload.asset.id
      : null;
  const rawImageUrl =
    payload &&
    typeof payload === 'object' &&
    payload.upload &&
    typeof payload.upload === 'object' &&
    typeof payload.upload.imageUrl === 'string'
      ? payload.upload.imageUrl.trim()
      : '';
  const rawAssetUrl =
    payload &&
    typeof payload === 'object' &&
    payload.upload &&
    typeof payload.upload === 'object' &&
    payload.upload.asset &&
    typeof payload.upload.asset === 'object' &&
    typeof payload.upload.asset.url === 'string'
      ? payload.upload.asset.url.trim()
      : '';
  const uploadAssetUrl = rawImageUrl || rawAssetUrl;
  const resolvedAssetUrl = uploadAssetUrl
    ? new URL(uploadAssetUrl, baseUrl).toString()
    : '';

  if (uploadAssetId == null) {
    throw new Error(`[${name}] upload response missing asset id`);
  }
  if (!resolvedAssetUrl) {
    throw new Error(`[${name}] upload response missing image URL`);
  }
  if (!isCanonicalGalleryProxyUrl(uploadAssetUrl, baseUrl)) {
    throw new Error(
      `[${name}] upload response URL must use ${GALLERY_FILE_PROXY_PREFIX}* (received ${uploadAssetUrl})`,
    );
  }

  console.log(
    `[check-gallery-upload-auth] ${name}: 201 (asset=${uploadAssetId})`,
  );
  return {
    assetId: uploadAssetId,
    assetUrl: resolvedAssetUrl,
  };
};

const verifyAssetReadable = async ({ name, assetUrl, acceptHeader, timeoutMs }) => {
  const headResponse = await withTimeout(
    (signal) =>
      fetch(assetUrl, {
        method: 'HEAD',
        headers: {
          Accept: acceptHeader,
        },
        signal,
      }),
    timeoutMs,
  );
  if (headResponse.ok) {
    console.log(`[check-gallery-upload-auth] ${name}: asset readable (${headResponse.status})`);
    return;
  }
  if (headResponse.status !== 405 && headResponse.status !== 501) {
    throw new Error(
      `[${name}] expected readable asset, received ${headResponse.status} at ${assetUrl}`,
    );
  }

  const getResponse = await withTimeout(
    (signal) =>
      fetch(assetUrl, {
        method: 'GET',
        headers: {
          Accept: acceptHeader,
        },
        signal,
      }),
    timeoutMs,
  );
  if (!getResponse.ok) {
    throw new Error(`[${name}] expected readable asset, received ${getResponse.status} at ${assetUrl}`);
  }
  console.log(`[check-gallery-upload-auth] ${name}: asset readable (${getResponse.status})`);
};

const deleteProbe = async ({
  name,
  url,
  token,
  timeoutMs,
}) => {
  const response = await withTimeout(
    (signal) =>
      fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal,
      }),
    timeoutMs,
  );
  if (response.status === 204) {
    console.log(`[check-gallery-upload-auth] ${name}: delete 204`);
    return;
  }
  const payload = await safeJson(response);
  const message = extractErrorMessage(payload);
  throw new Error(
    `[${name}] expected delete 204, received ${response.status}${message ? ` (${message})` : ''}`,
  );
};

const runUploadLifecycleProbe = async ({
  name,
  uploadUrl,
  deleteBaseUrl,
  baseUrl,
  token,
  idField,
  idValue,
  variant,
  timeoutMs,
  keepAssets,
}) => {
  const uploaded = await uploadProbe({
    name,
    url: uploadUrl,
    baseUrl,
    token,
    idField,
    idValue,
    variant,
    timeoutMs,
  });

  let lifecycleError = null;
  try {
    await verifyAssetReadable({
      name,
      assetUrl: uploaded.assetUrl,
      acceptHeader: variant.acceptHeader,
      timeoutMs,
    });
  } catch (error) {
    lifecycleError = error;
  }

  let cleanupError = null;
  if (!keepAssets) {
    const deleteUrl = new URL(`${encodeURIComponent(String(uploaded.assetId))}`, deleteBaseUrl).toString();
    try {
      await deleteProbe({
        name,
        url: deleteUrl,
        token,
        timeoutMs,
      });
    } catch (error) {
      cleanupError = error;
    }
  } else {
    console.log(
      `[check-gallery-upload-auth] ${name}: cleanup skipped (--keep-assets, asset=${uploaded.assetId})`,
    );
  }

  if (lifecycleError && cleanupError) {
    throw new Error(`${errorMessage(lifecycleError)}; cleanup failed: ${errorMessage(cleanupError)}`);
  }
  if (lifecycleError) {
    throw lifecycleError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
};

const run = async () => {
  const options = parseArgs();
  const baseUrl = new URL(options.base);

  const loginUrl = new URL('/api/auth/login', baseUrl).toString();
  const pageUploadUrl = new URL('/api/pages/gallery-images', baseUrl).toString();
  const flightUploadUrl = new URL('/api/flight-plans/gallery-images', baseUrl).toString();
  const pageDeleteBaseUrl = new URL('/api/pages/gallery-images/', baseUrl).toString();
  const flightDeleteBaseUrl = new URL('/api/flight-plans/gallery-images/', baseUrl).toString();

  console.log(`[check-gallery-upload-auth] base=${baseUrl.origin}`);

  const loginResponse = await withTimeout(
    (signal) =>
      fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: options.email,
          password: options.password,
        }),
        signal,
      }),
    options.timeoutMs,
  );

  const loginPayload = await safeJson(loginResponse);
  if (!loginResponse.ok) {
    const message = extractErrorMessage(loginPayload);
    throw new Error(
      `Login failed (${loginResponse.status})${message ? `: ${message}` : ''}`,
    );
  }

  const token =
    loginPayload &&
    typeof loginPayload === 'object' &&
    typeof loginPayload.token === 'string'
      ? loginPayload.token.trim()
      : '';
  if (!token) {
    throw new Error('Login response did not include a bearer token.');
  }

  const selectedVariants = options.probeTypes
    .map((probeType) => PROBE_VARIANTS_BY_KEY.get(probeType))
    .filter(Boolean);
  const targets = [
    {
      name: 'page-gallery',
      uploadUrl: pageUploadUrl,
      deleteBaseUrl: pageDeleteBaseUrl,
      idField: 'pageId',
      idValue: options.pageId,
    },
    {
      name: 'flight-plan-gallery',
      uploadUrl: flightUploadUrl,
      deleteBaseUrl: flightDeleteBaseUrl,
      idField: 'flightPlanId',
      idValue: options.flightPlanId,
    },
  ];

  for (const target of targets) {
    for (const variant of selectedVariants) {
      await runUploadLifecycleProbe({
        name: `${target.name}:${variant.key}`,
        uploadUrl: target.uploadUrl,
        deleteBaseUrl: target.deleteBaseUrl,
        baseUrl,
        token,
        idField: target.idField,
        idValue: target.idValue,
        variant,
        timeoutMs: options.timeoutMs,
        keepAssets: options.keepAssets,
      });
    }
  }

  console.log('[check-gallery-upload-auth] OK');
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[check-gallery-upload-auth] FAILED: ${message}`);
  process.exit(1);
});
