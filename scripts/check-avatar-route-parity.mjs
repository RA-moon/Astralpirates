#!/usr/bin/env node

import { createHash } from 'node:crypto';
import process from 'node:process';
import {
  encodePathSegments,
  fetchWithTimeout,
  isImageContentType,
  resolveAvatarRouteTargets,
  trim,
} from './lib/avatar-route-utils.mjs';
import { parseAvatarRouteProbeArgs } from './lib/avatar-route-args.mjs';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_SAMPLE = 12;
const DEFAULT_MAX_MISMATCHES = 0;
const DEFAULT_MAX_PROBE_ERRORS = 0;
const DEFAULT_MIN_FILENAMES = 0;
const RANGE_HEADER = 'bytes=0-262143';

const usage = () => {
  console.log(`Usage: node scripts/check-avatar-route-parity.mjs [options]

Checks parity between:
  - /api/avatars/file/<filename>
  - /media/avatars/<filename>

Parity checks compare route status and, for 200 image responses, content hash.

Options:
  --base <url>                     Base URL (default: ${DEFAULT_BASE_URL})
  --crew-url <url>                 Crew API endpoint (default: /api/crew?limit=500 on base)
  --filename <filename>            Additional avatar filename to probe (repeatable)
  --internal-host <host>           Internal host filter (default: derived from --base)
  --timeout-ms <ms>                Request timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --min-filenames <n>              Minimum filenames required before pass/fail evaluation (default: ${DEFAULT_MIN_FILENAMES})
  --max-mismatches <n>             Allowed route parity mismatches (default: ${DEFAULT_MAX_MISMATCHES})
  --max-probe-errors <n>           Allowed probe transport failures (status=0) (default: ${DEFAULT_MAX_PROBE_ERRORS})
  --max-sample <n>                 Number of sample mismatches to print (default: ${DEFAULT_MAX_SAMPLE})
  -h, --help                       Show this help
`);
};

const parseArgs = () => {
  return parseAvatarRouteProbeArgs({
    argv: process.argv.slice(2),
    defaults: {
      base: DEFAULT_BASE_URL,
      crewUrl: '',
      filenames: [],
      internalHost: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
      minFilenames: DEFAULT_MIN_FILENAMES,
      maxMismatches: DEFAULT_MAX_MISMATCHES,
      maxProbeErrors: DEFAULT_MAX_PROBE_ERRORS,
      maxSample: DEFAULT_MAX_SAMPLE,
    },
    usage,
    numericOptions: {
      '--timeout-ms': {
        key: 'timeoutMs',
        fallback: DEFAULT_TIMEOUT_MS,
        coerceZeroToFallback: true,
      },
      '--min-filenames': {
        key: 'minFilenames',
        fallback: DEFAULT_MIN_FILENAMES,
      },
      '--max-mismatches': {
        key: 'maxMismatches',
        fallback: DEFAULT_MAX_MISMATCHES,
      },
      '--max-probe-errors': {
        key: 'maxProbeErrors',
        fallback: DEFAULT_MAX_PROBE_ERRORS,
      },
      '--max-sample': {
        key: 'maxSample',
        fallback: DEFAULT_MAX_SAMPLE,
        coerceZeroToFallback: true,
      },
    },
  });
};

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
      'astral-avatar-route-parity-check',
    );

    const contentType = trim(response.headers.get('content-type')) || null;
    if (response.status !== 200 && response.status !== 206) {
      return {
        status: response.status,
        contentType,
        isImage: isImageContentType(contentType),
        sha256: null,
        bytes: 0,
        error: null,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: 200,
      contentType,
      isImage: isImageContentType(contentType),
      sha256: sha256Hex(bytes),
      bytes: bytes.length,
      error: null,
    };
  } catch (error) {
    return {
      status: 0,
      contentType: null,
      isImage: false,
      sha256: null,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const run = async () => {
  const options = parseArgs();

  console.log(`[avatar-route-parity] base=${options.baseUrl.origin}`);
  console.log(`[avatar-route-parity] crew=${options.crewUrl.toString()}`);
  console.log(`[avatar-route-parity] internalHost=${options.internalHost}`);

  const targets = await resolveAvatarRouteTargets({
    crewUrl: options.crewUrl,
    timeoutMs: options.timeoutMs,
    internalHost: options.internalHost,
    extraFilenames: options.filenames,
    userAgent: 'astral-avatar-route-parity-check',
  });
  console.log(`[avatar-route-parity] uniqueFilenames=${targets.length}`);

  const mismatches = [];
  const probeErrors = [];

  for (const filename of targets) {
    const encoded = encodePathSegments(filename);
    if (!encoded) continue;

    const apiUrl = new URL(`/api/avatars/file/${encoded}`, options.baseUrl).toString();
    const legacyUrl = new URL(`/media/avatars/${encoded}`, options.baseUrl).toString();

    const [apiResult, legacyResult] = await Promise.all([
      probe({ url: apiUrl, timeoutMs: options.timeoutMs }),
      probe({ url: legacyUrl, timeoutMs: options.timeoutMs }),
    ]);

    if (apiResult.status === 0 || legacyResult.status === 0) {
      probeErrors.push({
        filename,
        api: apiResult,
        legacy: legacyResult,
      });
      continue;
    }

    if (apiResult.status !== legacyResult.status) {
      mismatches.push({
        filename,
        reason: 'status_mismatch',
        api: apiResult,
        legacy: legacyResult,
      });
      continue;
    }

    if (apiResult.status !== 200) {
      continue;
    }

    if (!apiResult.isImage || !legacyResult.isImage) {
      mismatches.push({
        filename,
        reason: 'non_image',
        api: apiResult,
        legacy: legacyResult,
      });
      continue;
    }

    if (!apiResult.sha256 || !legacyResult.sha256 || apiResult.sha256 !== legacyResult.sha256) {
      mismatches.push({
        filename,
        reason: 'content_hash_mismatch',
        api: apiResult,
        legacy: legacyResult,
      });
    }
  }

  console.log(
    `[avatar-route-parity] counts mismatches=${mismatches.length} probeErrors=${probeErrors.length}`,
  );

  const printSamples = (label, entries) => {
    if (!entries.length) return;
    console.log(`[avatar-route-parity] ${label} sample:`);
    for (const entry of entries.slice(0, options.maxSample)) {
      console.log(
        `  - ${entry.filename} (${entry.reason ?? 'probe_error'}):` +
          ` api=${entry.api.status} ${entry.api.contentType ?? '-'}` +
          ` sha=${entry.api.sha256 ?? '-'}` +
          ` legacy=${entry.legacy.status} ${entry.legacy.contentType ?? '-'}` +
          ` sha=${entry.legacy.sha256 ?? '-'}` +
          ` apiErr=${entry.api.error ?? '-'}` +
          ` legacyErr=${entry.legacy.error ?? '-'}`,
      );
    }
  };

  printSamples('mismatches', mismatches);
  printSamples('probeErrors', probeErrors);

  const failures = [];
  if (targets.length < options.minFilenames) {
    failures.push(
      `unique filename count ${targets.length} is below required minimum ${options.minFilenames}`,
    );
  }
  if (mismatches.length > options.maxMismatches) {
    failures.push(`mismatches=${mismatches.length} > allowed=${options.maxMismatches}`);
  }
  if (probeErrors.length > options.maxProbeErrors) {
    failures.push(`probeErrors=${probeErrors.length} > allowed=${options.maxProbeErrors}`);
  }

  if (failures.length > 0) {
    console.error(`[avatar-route-parity] FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }

  console.log('[avatar-route-parity] OK');
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[avatar-route-parity] FAILED: ${message}`);
  process.exit(1);
});
