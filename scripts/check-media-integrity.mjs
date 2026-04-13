#!/usr/bin/env node

import process from 'node:process';
import {
  asNonNegativeInt,
  decodeSafe,
  fetchWithTimeout,
  trim,
} from './lib/avatar-route-utils.mjs';
import { applyReportCliArgs } from './lib/report-cli-options.mjs';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_MISSING_REFERENCED = 0;
const DEFAULT_MAX_MISSING_CATALOG = 0;
const DEFAULT_MAX_SAMPLE = 12;
const MAX_PAGES = 100;
const CONCURRENCY = 8;

const usage = () => {
  console.log(`Usage: node scripts/check-media-integrity.mjs [options]

Checks media object integrity using APIs and file routes.

Always checks referenced gallery assets from:
  - /api/pages (image carousel slides)
  - /api/flight-plans (gallerySlides assets)

Optional catalog checks include:
  - /api/gallery-images
  - /api/avatars

Options:
  --base <url>                     Base URL (default: ${DEFAULT_BASE_URL})
  --token <token>                  Optional bearer token (or MEDIA_INTEGRITY_PROBE_TOKEN)
  --email <email>                  Optional auth email (or MEDIA_INTEGRITY_PROBE_EMAIL)
  --password <password>            Optional auth password (or MEDIA_INTEGRITY_PROBE_PASSWORD)
  --timeout-ms <ms>                Request timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --check-catalog                  Also validate gallery-images + avatars collections
  --max-missing-referenced <n>     Max allowed missing referenced objects (default: ${DEFAULT_MAX_MISSING_REFERENCED})
  --max-missing-catalog <n>        Max allowed missing catalog objects (default: ${DEFAULT_MAX_MISSING_CATALOG})
  --max-sample <n>                 Number of sample failures to print (default: ${DEFAULT_MAX_SAMPLE})
  -h, --help                       Show this help
`);
};

const parseArgs = () => {
  const options = {
    base: DEFAULT_BASE_URL,
    token: trim(process.env.MEDIA_INTEGRITY_PROBE_TOKEN),
    email: trim(process.env.MEDIA_INTEGRITY_PROBE_EMAIL),
    password: process.env.MEDIA_INTEGRITY_PROBE_PASSWORD || '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    checkCatalog: false,
    maxMissingReferenced: DEFAULT_MAX_MISSING_REFERENCED,
    maxMissingCatalog: DEFAULT_MAX_MISSING_CATALOG,
    maxSample: DEFAULT_MAX_SAMPLE,
  };

  const { helpRequested } = applyReportCliArgs({
    argv: process.argv.slice(2),
    options,
    valueFlags: {
      '--base': 'base',
      '--token': 'token',
      '--email': 'email',
      '--password': 'password',
      '--timeout-ms': 'timeoutMs',
      '--max-missing-referenced': 'maxMissingReferenced',
      '--max-missing-catalog': 'maxMissingCatalog',
      '--max-sample': 'maxSample',
    },
    booleanFlags: {
      '--check-catalog': 'checkCatalog',
    },
    strictUnknown: true,
  });

  if (helpRequested) {
    usage();
    process.exit(0);
  }

  options.token = trim(options.token);
  options.email = trim(options.email);
  options.timeoutMs = asNonNegativeInt(options.timeoutMs, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  options.maxMissingReferenced = asNonNegativeInt(
    options.maxMissingReferenced,
    DEFAULT_MAX_MISSING_REFERENCED,
  );
  options.maxMissingCatalog = asNonNegativeInt(options.maxMissingCatalog, DEFAULT_MAX_MISSING_CATALOG);
  options.maxSample = asNonNegativeInt(options.maxSample, DEFAULT_MAX_SAMPLE) || DEFAULT_MAX_SAMPLE;

  if ((options.email && !options.password) || (!options.email && options.password)) {
    throw new Error('Both --email and --password are required when using authenticated probe mode.');
  }

  return options;
};

const encodePathSegments = (value) =>
  trim(value)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const fetchJson = async (url, timeoutMs, headers = {}) => {
  const response = await fetchWithTimeout(
    url,
    {
      headers,
    },
    timeoutMs,
    'astral-media-integrity-check',
  );
  const body = await response.text();
  let parsed = null;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body };
    }
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(`Request failed ${response.status} for ${url}${body ? `: ${String(body).slice(0, 240)}` : ''}`),
      { status: response.status, url },
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Unexpected JSON payload for ${url}`);
  }
  return parsed;
};

const isAuthRequestError = (error) =>
  !!error &&
  typeof error === 'object' &&
  'status' in error &&
  (error.status === 401 || error.status === 403);

const probeStatus = async (url, timeoutMs, headers = {}) => {
  try {
    const headResponse = await fetchWithTimeout(
      url,
      {
        method: 'HEAD',
        headers,
      },
      timeoutMs,
      'astral-media-integrity-check',
    );
    if (headResponse.status !== 405 && headResponse.status !== 501) {
      return headResponse.status;
    }

    const getResponse = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          ...headers,
          Range: 'bytes=0-0',
        },
      },
      timeoutMs,
      'astral-media-integrity-check',
    );
    return getResponse.status;
  } catch {
    return 0;
  }
};

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

const fileKey = (type, filename) => `${type}:${filename}`;

const extractFilenameFromProxyUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      pathname = raw;
    }
  }

  const prefixes = ['/api/gallery-images/file/', '/media/gallery/', '/gallery/'];
  for (const prefix of prefixes) {
    const index = pathname.indexOf(prefix);
    if (index === -1) continue;
    const relative = pathname.slice(index + prefix.length).replace(/^\/+/, '');
    if (!relative) continue;
    return decodeSafe(relative);
  }
  return '';
};

const asFilename = (value) => {
  if (!value || typeof value !== 'object') return '';
  const candidate = trim(value.filename);
  return candidate;
};

const collectPageReferences = (pages) => {
  const refs = [];
  for (const page of pages) {
    const layout = Array.isArray(page?.layout) ? page.layout : [];
    for (const block of layout) {
      if (!block || block.blockType !== 'imageCarousel') continue;
      const slides = Array.isArray(block.slides) ? block.slides : [];
      for (const slide of slides) {
        const fromGalleryImage = asFilename(slide?.galleryImage);
        const fromImage = asFilename(slide?.image);
        const fromUrl = extractFilenameFromProxyUrl(slide?.imageUrl);
        const filename = fromGalleryImage || fromImage || fromUrl;
        if (!filename) continue;
        refs.push({
          type: 'gallery',
          filename,
          source: 'page',
          ownerId: page?.id ?? null,
          ownerLabel: trim(page?.title) || trim(page?.path) || null,
        });
      }
    }
  }
  return refs;
};

const collectFlightPlanReferences = (plans) => {
  const refs = [];
  for (const plan of plans) {
    const slides = Array.isArray(plan?.gallerySlides) ? plan.gallerySlides : [];
    for (const slide of slides) {
      const fromAsset = asFilename(slide?.asset);
      const fromUrl = extractFilenameFromProxyUrl(slide?.imageUrl);
      const filename = fromAsset || fromUrl;
      if (!filename) continue;
      refs.push({
        type: 'gallery',
        filename,
        source: 'flight-plan',
        ownerId: plan?.id ?? null,
        ownerLabel: trim(plan?.slug) || trim(plan?.title) || null,
      });
    }
  }
  return refs;
};

const collectCatalogFiles = (docs, type) => {
  const files = [];
  for (const doc of docs) {
    const filename = trim(doc?.filename);
    if (!filename) continue;
    files.push({
      type,
      filename,
      source: 'catalog',
      ownerId: doc?.id ?? null,
      ownerLabel: trim(doc?.title) || filename,
    });
  }
  return files;
};

const paginateDocs = async ({ baseUrl, path, timeoutMs, requestHeaders }) => {
  const docs = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(path, baseUrl);
    url.searchParams.set('limit', '200');
    url.searchParams.set('depth', '2');
    url.searchParams.set('page', String(page));
    const payload = await fetchJson(url.toString(), timeoutMs, requestHeaders);
    if (!Array.isArray(payload.docs)) {
      throw new Error(`Unexpected payload shape for ${url.toString()} (expected docs[])`);
    }
    docs.push(...payload.docs);

    const totalPages =
      typeof payload.totalPages === 'number' && Number.isFinite(payload.totalPages)
        ? payload.totalPages
        : page;
    if (page >= totalPages || payload.docs.length === 0) break;
  }
  return docs;
};

const fetchPages = async ({ baseUrl, timeoutMs, requestHeaders = {} }) =>
  paginateDocs({ baseUrl, path: '/api/pages', timeoutMs, requestHeaders });

const fetchGalleryCatalog = async ({ baseUrl, timeoutMs, requestHeaders = {} }) =>
  paginateDocs({ baseUrl, path: '/api/gallery-images', timeoutMs, requestHeaders });

const fetchAvatarCatalog = async ({ baseUrl, timeoutMs, requestHeaders = {} }) =>
  paginateDocs({ baseUrl, path: '/api/avatars', timeoutMs, requestHeaders });

const fetchFlightPlans = async ({ baseUrl, timeoutMs, requestHeaders = {} }) => {
  const url = new URL('/api/flight-plans', baseUrl);
  url.searchParams.set('limit', '500');
  url.searchParams.set('depth', '2');
  const payload = await fetchJson(url.toString(), timeoutMs, requestHeaders);
  if (!Array.isArray(payload.plans)) {
    throw new Error(`Unexpected payload shape for ${url.toString()} (expected plans[])`);
  }
  return payload.plans;
};

const loginWithPassword = async ({ baseUrl, email, password, timeoutMs }) => {
  const url = new URL('/api/auth/login', baseUrl).toString();
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    },
    timeoutMs,
    'astral-media-integrity-check',
  );
  const body = await response.text();
  let payload = null;
  if (body) {
    try {
      payload = JSON.parse(body);
    } catch {
      payload = { raw: body };
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof payload.error === 'string'
        ? payload.error
        : body.slice(0, 240);
    throw new Error(`Authenticated media probe login failed (${response.status})${message ? `: ${message}` : ''}`);
  }
  const token =
    payload && typeof payload === 'object' && typeof payload.token === 'string'
      ? payload.token.trim()
      : '';
  if (!token) {
    throw new Error('Authenticated media probe login did not return a token.');
  }
  return token;
};

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };

  const workers = [];
  const totalWorkers = Math.min(Math.max(limit, 1), items.length || 1);
  for (let index = 0; index < totalWorkers; index += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
};

const isOkStatus = (status) => status >= 200 && status < 300;

const createProbeUrl = (baseUrl, type, filename) => {
  const encoded = encodePathSegments(filename);
  if (type === 'avatar') {
    return new URL(`/api/avatars/file/${encoded}`, baseUrl).toString();
  }
  return new URL(`/api/gallery-images/file/${encoded}`, baseUrl).toString();
};

const summarizeGroup = ({ items, statusByKey, maxSample }) => {
  const uniqueKeys = new Set();
  let missingReferences = 0;
  const samples = [];

  for (const item of items) {
    const key = fileKey(item.type, item.filename);
    uniqueKeys.add(key);
    const status = statusByKey.get(key) ?? 0;
    if (!isOkStatus(status)) {
      missingReferences += 1;
      if (samples.length < maxSample) {
        samples.push({
          type: item.type,
          filename: item.filename,
          source: item.source,
          ownerId: item.ownerId,
          ownerLabel: item.ownerLabel,
          status,
        });
      }
    }
  }

  let missingUnique = 0;
  for (const key of uniqueKeys) {
    const status = statusByKey.get(key) ?? 0;
    if (!isOkStatus(status)) missingUnique += 1;
  }

  return {
    totalReferences: items.length,
    uniqueObjects: uniqueKeys.size,
    missingReferences,
    missingUniqueObjects: missingUnique,
    samples,
  };
};

const run = async () => {
  const options = parseArgs();
  const baseUrl = new URL(options.base);
  let token = options.token;
  let authMode = 'unauthenticated';
  let authUser = '';

  if (!token && options.email) {
    token = await loginWithPassword({
      baseUrl,
      email: options.email,
      password: options.password,
      timeoutMs: options.timeoutMs,
    });
    authMode = 'email-password';
    authUser = options.email;
  } else if (token) {
    authMode = 'token';
  }

  let requestHeaders = authHeaders(token);
  let attemptedPasswordFallback = false;
  const runWithAuthFallback = async (operation) => {
    try {
      return await operation(requestHeaders);
    } catch (error) {
      const canFallbackToPassword =
        !attemptedPasswordFallback && authMode === 'token' && options.email && options.password;
      if (!canFallbackToPassword || !isAuthRequestError(error)) {
        throw error;
      }
      attemptedPasswordFallback = true;
      console.warn(
        '[media-integrity] token auth failed with 401/403; retrying with email/password login fallback.',
      );
      token = await loginWithPassword({
        baseUrl,
        email: options.email,
        password: options.password,
        timeoutMs: options.timeoutMs,
      });
      requestHeaders = authHeaders(token);
      authMode = 'email-password';
      authUser = options.email;
      return operation(requestHeaders);
    }
  };

  const [pages, plans] = await runWithAuthFallback((headers) =>
    Promise.all([
      fetchPages({ baseUrl, timeoutMs: options.timeoutMs, requestHeaders: headers }),
      fetchFlightPlans({ baseUrl, timeoutMs: options.timeoutMs, requestHeaders: headers }),
    ]),
  );

  console.log(`[media-integrity] base=${baseUrl.origin}`);
  if (authMode === 'token') {
    console.log('[media-integrity] mode=authenticated token');
  } else if (authMode === 'email-password') {
    console.log(`[media-integrity] mode=authenticated user=${authUser}`);
  }
  console.log(
    `[media-integrity] thresholds referenced<=${options.maxMissingReferenced}` +
      (options.checkCatalog ? ` catalog<=${options.maxMissingCatalog}` : ' catalog=skipped'),
  );

  const referencedItems = [
    ...collectPageReferences(pages),
    ...collectFlightPlanReferences(plans),
  ];

  let catalogItems = [];
  if (options.checkCatalog) {
    const [galleryDocs, avatarDocs] = await runWithAuthFallback((headers) =>
      Promise.all([
        fetchGalleryCatalog({ baseUrl, timeoutMs: options.timeoutMs, requestHeaders: headers }),
        fetchAvatarCatalog({ baseUrl, timeoutMs: options.timeoutMs, requestHeaders: headers }),
      ]),
    );
    catalogItems = [
      ...collectCatalogFiles(galleryDocs, 'gallery'),
      ...collectCatalogFiles(avatarDocs, 'avatar'),
    ];
  }

  const allUniqueObjects = new Map();
  for (const item of [...referencedItems, ...catalogItems]) {
    const key = fileKey(item.type, item.filename);
    if (!allUniqueObjects.has(key)) {
      allUniqueObjects.set(key, item);
    }
  }
  const uniqueItems = Array.from(allUniqueObjects.values());
  const probeStatuses = await mapLimit(uniqueItems, CONCURRENCY, async (item) => {
    const url = createProbeUrl(baseUrl, item.type, item.filename);
    const status = await probeStatus(url, options.timeoutMs, requestHeaders);
    return {
      key: fileKey(item.type, item.filename),
      status,
    };
  });

  const statusByKey = new Map(probeStatuses.map((entry) => [entry.key, entry.status]));

  const referencedSummary = summarizeGroup({
    items: referencedItems,
    statusByKey,
    maxSample: options.maxSample,
  });
  const catalogSummary = options.checkCatalog
    ? summarizeGroup({
        items: catalogItems,
        statusByKey,
        maxSample: options.maxSample,
      })
    : null;

  console.log(
    `[media-integrity] referenced: references=${referencedSummary.totalReferences}` +
      ` unique=${referencedSummary.uniqueObjects}` +
      ` missingUnique=${referencedSummary.missingUniqueObjects}`,
  );
  if (options.checkCatalog && catalogSummary) {
    console.log(
      `[media-integrity] catalog: references=${catalogSummary.totalReferences}` +
        ` unique=${catalogSummary.uniqueObjects}` +
        ` missingUnique=${catalogSummary.missingUniqueObjects}`,
    );
  }

  if (referencedSummary.samples.length > 0) {
    console.log('[media-integrity] referenced missing sample:');
    for (const sample of referencedSummary.samples) {
      console.log(
        `  - ${sample.type}:${sample.filename}` +
          ` status=${sample.status}` +
          ` source=${sample.source}` +
          ` owner=${sample.ownerId ?? 'n/a'}:${sample.ownerLabel ?? 'n/a'}`,
      );
    }
  }

  if (options.checkCatalog && catalogSummary && catalogSummary.samples.length > 0) {
    console.log('[media-integrity] catalog missing sample:');
    for (const sample of catalogSummary.samples) {
      console.log(
        `  - ${sample.type}:${sample.filename}` +
          ` status=${sample.status}` +
          ` owner=${sample.ownerId ?? 'n/a'}:${sample.ownerLabel ?? 'n/a'}`,
      );
    }
  }

  const failures = [];
  if (referencedSummary.missingUniqueObjects > options.maxMissingReferenced) {
    failures.push(
      `referenced missing unique objects ${referencedSummary.missingUniqueObjects} exceeded threshold ${options.maxMissingReferenced}`,
    );
  }
  if (
    options.checkCatalog &&
    catalogSummary &&
    catalogSummary.missingUniqueObjects > options.maxMissingCatalog
  ) {
    failures.push(
      `catalog missing unique objects ${catalogSummary.missingUniqueObjects} exceeded threshold ${options.maxMissingCatalog}`,
    );
  }

  if (failures.length > 0) {
    console.error(`[media-integrity] FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }

  console.log('[media-integrity] OK');
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[media-integrity] FAILED: ${message}`);
  process.exit(1);
});
