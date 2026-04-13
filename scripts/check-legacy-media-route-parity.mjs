#!/usr/bin/env node

import { createHash } from 'node:crypto';
import process from 'node:process';
import {
  asNonNegativeInt,
  encodePathSegments,
  fetchWithTimeout,
  isImageContentType,
  normalizeFilename,
  trim,
} from './lib/avatar-route-utils.mjs';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_EXPECT_STATUS = 404;
const DEFAULT_MAX_MISMATCHES = 0;
const DEFAULT_MAX_PROBE_ERRORS = 0;
const DEFAULT_MAX_SAMPLE = 12;
const RANGE_HEADER = 'bytes=0-262143';

const ROUTE_MATRIX = {
  avatars: {
    apiPrefix: '/api/avatars/file/',
    legacyPrefix: '/media/avatars/',
    defaultFilename: 'nonexistent-avatar-probe.jpg',
  },
  gallery: {
    apiPrefix: '/api/gallery-images/file/',
    legacyPrefix: '/media/gallery/',
    defaultFilename: 'nonexistent-gallery-probe.jpg',
  },
  tasks: {
    apiPrefix: '/api/task-attachments/file/',
    legacyPrefix: '/media/tasks/',
    defaultFilename: 'nonexistent-task-probe.pdf',
  },
};

const usage = () => {
  const routeKinds = Object.keys(ROUTE_MATRIX).join(', ');
  console.log(`Usage: node scripts/check-legacy-media-route-parity.mjs [options]

Checks legacy /media/* compatibility parity against canonical /api/* media routes
for explicit probe files. Default probes target missing-file sentinels across:
  - avatars
  - gallery
  - tasks
Default probe filenames are runtime-suffixed to avoid stale edge/cache responses.

Options:
  --base <url>                     Base URL (default: ${DEFAULT_BASE_URL})
  --probe <kind:filename>          Probe target (repeatable). kind in: ${routeKinds}
  --timeout-ms <ms>                Request timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --expect-status <code>           Required status for api+legacy probes (default: ${DEFAULT_EXPECT_STATUS})
  --max-mismatches <n>             Allowed parity mismatches (default: ${DEFAULT_MAX_MISMATCHES})
  --max-probe-errors <n>           Allowed transport failures (status=0) (default: ${DEFAULT_MAX_PROBE_ERRORS})
  --max-sample <n>                 Number of mismatch samples to print (default: ${DEFAULT_MAX_SAMPLE})
  -h, --help                       Show this help
`);
};

const appendProbeSuffix = (filename, suffix) => {
  const normalized = normalizeFilename(filename);
  if (!normalized) return normalized;
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < normalized.length - 1) {
    return `${normalized.slice(0, dotIndex)}-${suffix}${normalized.slice(dotIndex)}`;
  }
  return `${normalized}-${suffix}`;
};

const parseProbe = (value) => {
  const raw = trim(value);
  const separator = raw.indexOf(':');
  if (separator <= 0) {
    throw new Error(`Invalid --probe value "${value}" (expected kind:filename).`);
  }
  const kind = raw.slice(0, separator).toLowerCase();
  const filename = normalizeFilename(raw.slice(separator + 1));
  if (!kind || !(kind in ROUTE_MATRIX)) {
    throw new Error(`Invalid probe kind "${kind}" in --probe "${value}".`);
  }
  if (!filename) {
    throw new Error(`Invalid probe filename in --probe "${value}".`);
  }
  return { kind, filename };
};

const parseArgs = () => {
  const options = {
    base: DEFAULT_BASE_URL,
    probes: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    expectStatus: DEFAULT_EXPECT_STATUS,
    maxMismatches: DEFAULT_MAX_MISMATCHES,
    maxProbeErrors: DEFAULT_MAX_PROBE_ERRORS,
    maxSample: DEFAULT_MAX_SAMPLE,
  };

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--base' && typeof next === 'string') {
      options.base = next;
      index += 1;
      continue;
    }
    if (arg === '--probe' && typeof next === 'string') {
      options.probes.push(parseProbe(next));
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms' && typeof next === 'string') {
      options.timeoutMs = asNonNegativeInt(next, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
      index += 1;
      continue;
    }
    if (arg === '--expect-status' && typeof next === 'string') {
      options.expectStatus = asNonNegativeInt(next, DEFAULT_EXPECT_STATUS);
      index += 1;
      continue;
    }
    if (arg === '--max-mismatches' && typeof next === 'string') {
      options.maxMismatches = asNonNegativeInt(next, DEFAULT_MAX_MISMATCHES);
      index += 1;
      continue;
    }
    if (arg === '--max-probe-errors' && typeof next === 'string') {
      options.maxProbeErrors = asNonNegativeInt(next, DEFAULT_MAX_PROBE_ERRORS);
      index += 1;
      continue;
    }
    if (arg === '--max-sample' && typeof next === 'string') {
      options.maxSample = asNonNegativeInt(next, DEFAULT_MAX_SAMPLE) || DEFAULT_MAX_SAMPLE;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const baseUrl = new URL(options.base);
  const defaultProbeSuffix = `${Date.now().toString(36)}-${process.pid}`;
  const probes =
    options.probes.length > 0
      ? options.probes
      : Object.entries(ROUTE_MATRIX).map(([kind, config]) => ({
          kind,
          filename: appendProbeSuffix(config.defaultFilename, `${kind}-${defaultProbeSuffix}`),
        }));

  return {
    ...options,
    baseUrl,
    probes,
  };
};

const isHtmlContentType = (value) => trim(value).toLowerCase().startsWith('text/html');
const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');

const probe = async ({ url, timeoutMs }) => {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Range: RANGE_HEADER,
        },
      },
      timeoutMs,
      'astral-legacy-media-route-parity-check',
    );
    const contentType = trim(response.headers.get('content-type')) || null;

    if (response.status !== 200 && response.status !== 206) {
      return {
        status: response.status,
        contentType,
        isImage: isImageContentType(contentType),
        sha256: null,
        error: null,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      contentType,
      isImage: isImageContentType(contentType),
      sha256: sha256Hex(bytes),
      error: null,
    };
  } catch (error) {
    return {
      status: 0,
      contentType: null,
      isImage: false,
      sha256: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const run = async () => {
  const options = parseArgs();

  console.log(`[legacy-media-route-parity] base=${options.baseUrl.origin}`);
  console.log(
    `[legacy-media-route-parity] probes=${options.probes
      .map((entry) => `${entry.kind}:${entry.filename}`)
      .join(',')}`,
  );

  const mismatches = [];
  const probeErrors = [];

  for (const target of options.probes) {
    const config = ROUTE_MATRIX[target.kind];
    const encoded = encodePathSegments(target.filename);
    const apiUrl = new URL(`${config.apiPrefix}${encoded}`, options.baseUrl).toString();
    const legacyUrl = new URL(`${config.legacyPrefix}${encoded}`, options.baseUrl).toString();

    const apiProbe = await probe({ url: apiUrl, timeoutMs: options.timeoutMs });
    const legacyProbe = await probe({ url: legacyUrl, timeoutMs: options.timeoutMs });

    if (apiProbe.status === 0 || legacyProbe.status === 0) {
      probeErrors.push({ target, apiUrl, legacyUrl, apiProbe, legacyProbe });
    }

    const reasons = [];
    if (apiProbe.status !== legacyProbe.status) reasons.push('status-mismatch');
    if (
      options.expectStatus >= 0 &&
      (apiProbe.status !== options.expectStatus || legacyProbe.status !== options.expectStatus)
    ) {
      reasons.push(`expected-status-${options.expectStatus}`);
    }
    if (apiProbe.status >= 500 || legacyProbe.status >= 500) reasons.push('server-error');
    if (isHtmlContentType(apiProbe.contentType) && apiProbe.status >= 400) {
      reasons.push('api-html-error');
    }
    if (isHtmlContentType(legacyProbe.contentType) && legacyProbe.status >= 400) {
      reasons.push('legacy-html-error');
    }

    const apiOkImage = (apiProbe.status === 200 || apiProbe.status === 206) && apiProbe.isImage;
    const legacyOkImage =
      (legacyProbe.status === 200 || legacyProbe.status === 206) && legacyProbe.isImage;
    if (apiOkImage && legacyOkImage && apiProbe.sha256 && legacyProbe.sha256) {
      if (apiProbe.sha256 !== legacyProbe.sha256) reasons.push('image-hash-mismatch');
    }

    if (
      (apiProbe.status === 200 || apiProbe.status === 206) &&
      !apiProbe.isImage &&
      target.kind === 'avatars'
    ) {
      reasons.push('api-avatar-non-image-success');
    }
    if (
      (legacyProbe.status === 200 || legacyProbe.status === 206) &&
      !legacyProbe.isImage &&
      target.kind === 'avatars'
    ) {
      reasons.push('legacy-avatar-non-image-success');
    }

    if (reasons.length > 0) {
      mismatches.push({
        target,
        reasons,
        apiUrl,
        legacyUrl,
        apiProbe,
        legacyProbe,
      });
    }
  }

  console.log(
    `[legacy-media-route-parity] counts mismatches=${mismatches.length}` +
      ` probeErrors=${probeErrors.length}`,
  );

  if (mismatches.length > 0) {
    console.log('[legacy-media-route-parity] mismatch sample:');
    for (const entry of mismatches.slice(0, options.maxSample)) {
      console.log(
        `  - ${entry.target.kind}:${entry.target.filename} reasons=${entry.reasons.join(',')}` +
          ` api(status=${entry.apiProbe.status},type=${entry.apiProbe.contentType ?? '-'})` +
          ` legacy(status=${entry.legacyProbe.status},type=${entry.legacyProbe.contentType ?? '-'})`,
      );
    }
  }

  if (probeErrors.length > 0) {
    console.log('[legacy-media-route-parity] probe error sample:');
    for (const entry of probeErrors.slice(0, options.maxSample)) {
      console.log(
        `  - ${entry.target.kind}:${entry.target.filename}` +
          ` api=${entry.apiProbe.error ?? '-'} legacy=${entry.legacyProbe.error ?? '-'}`,
      );
    }
  }

  const failures = [];
  if (mismatches.length > options.maxMismatches) {
    failures.push(
      `mismatch count ${mismatches.length} exceeded threshold ${options.maxMismatches}`,
    );
  }
  if (probeErrors.length > options.maxProbeErrors) {
    failures.push(
      `probe error count ${probeErrors.length} exceeded threshold ${options.maxProbeErrors}`,
    );
  }

  if (failures.length > 0) {
    console.error(`[legacy-media-route-parity] FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }

  console.log('[legacy-media-route-parity] OK');
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[legacy-media-route-parity] FAILED: ${message}`);
  process.exit(1);
});
