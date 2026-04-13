#!/usr/bin/env node

import process from 'node:process';
import {
  encodePathSegments,
  probeImageRoute,
  resolveAvatarRouteTargets,
} from './lib/avatar-route-utils.mjs';
import { parseAvatarRouteProbeArgs } from './lib/avatar-route-args.mjs';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_SAMPLE = 12;
const DEFAULT_MIN_FILENAMES = 0;

const usage = () => {
  console.log(`Usage: node scripts/check-avatar-route-mime.mjs [options]

Checks avatar route MIME safety to prevent 200 text/html regressions.

Routes checked per discovered avatar filename:
  - /api/avatars/file/<filename>
  - /media/avatars/<filename>

Options:
  --base <url>                     Base URL (default: ${DEFAULT_BASE_URL})
  --crew-url <url>                 Crew API endpoint (default: /api/crew?limit=500 on base)
  --filename <filename>            Additional avatar filename to probe (repeatable)
  --internal-host <host>           Internal host filter (default: derived from --base)
  --timeout-ms <ms>                Probe timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --min-filenames <n>              Minimum filenames required before pass/fail evaluation (default: ${DEFAULT_MIN_FILENAMES})
  --max-non-image-api <n>          Allowed /api route 200 non-image responses (default: 0)
  --max-non-image-legacy <n>       Allowed /media route 200 non-image responses (default: 0)
  --max-probe-errors <n>           Allowed probe transport failures (status=0) (default: 0)
  --max-sample <n>                 Number of sample failures to print (default: ${DEFAULT_MAX_SAMPLE})
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
      maxNonImageApi: 0,
      maxNonImageLegacy: 0,
      maxProbeErrors: 0,
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
      '--max-non-image-api': {
        key: 'maxNonImageApi',
        fallback: 0,
      },
      '--max-non-image-legacy': {
        key: 'maxNonImageLegacy',
        fallback: 0,
      },
      '--max-probe-errors': {
        key: 'maxProbeErrors',
        fallback: 0,
      },
      '--max-sample': {
        key: 'maxSample',
        fallback: DEFAULT_MAX_SAMPLE,
        coerceZeroToFallback: true,
      },
    },
  });
};

const run = async () => {
  const options = parseArgs();

  console.log(`[avatar-route-mime] base=${options.baseUrl.origin}`);
  console.log(`[avatar-route-mime] crew=${options.crewUrl.toString()}`);
  console.log(`[avatar-route-mime] internalHost=${options.internalHost}`);

  const targets = await resolveAvatarRouteTargets({
    crewUrl: options.crewUrl,
    timeoutMs: options.timeoutMs,
    internalHost: options.internalHost,
    extraFilenames: options.filenames,
    userAgent: 'astral-avatar-route-mime-check',
  });
  console.log(`[avatar-route-mime] uniqueFilenames=${targets.length}`);

  const nonImageApi = [];
  const nonImageLegacy = [];
  const probeErrors = [];

  for (const filename of targets) {
    const encoded = encodePathSegments(filename);
    const apiUrl = new URL(`/api/avatars/file/${encoded}`, options.baseUrl).toString();
    const legacyUrl = new URL(`/media/avatars/${encoded}`, options.baseUrl).toString();

    const apiProbe = await probeImageRoute({
      url: apiUrl,
      timeoutMs: options.timeoutMs,
      userAgent: 'astral-avatar-route-mime-check',
    });
    const legacyProbe = await probeImageRoute({
      url: legacyUrl,
      timeoutMs: options.timeoutMs,
      userAgent: 'astral-avatar-route-mime-check',
    });

    if (apiProbe.status === 0 || legacyProbe.status === 0) {
      probeErrors.push({ filename, apiProbe, legacyProbe });
    }

    if (apiProbe.status === 200 && !apiProbe.isImage) {
      nonImageApi.push({ filename, url: apiUrl, probe: apiProbe });
    }
    if (legacyProbe.status === 200 && !legacyProbe.isImage) {
      nonImageLegacy.push({ filename, url: legacyUrl, probe: legacyProbe });
    }
  }

  console.log(
    `[avatar-route-mime] counts apiNonImage200=${nonImageApi.length}` +
      ` legacyNonImage200=${nonImageLegacy.length}` +
      ` probeErrors=${probeErrors.length}`,
  );

  const sample = (entries, label, mapper) => {
    if (!entries.length) return;
    console.log(`[avatar-route-mime] ${label} sample:`);
    for (const entry of entries.slice(0, options.maxSample)) {
      console.log(`  - ${mapper(entry)}`);
    }
  };

  sample(nonImageApi, 'api non-image 200', (entry) =>
    `${entry.filename} status=${entry.probe.status} contentType=${entry.probe.contentType ?? '-'} url=${entry.url}`,
  );
  sample(nonImageLegacy, 'legacy non-image 200', (entry) =>
    `${entry.filename} status=${entry.probe.status} contentType=${entry.probe.contentType ?? '-'} url=${entry.url}`,
  );
  sample(probeErrors, 'probe errors', (entry) =>
    `${entry.filename} api=${entry.apiProbe.error ?? '-'} legacy=${entry.legacyProbe.error ?? '-'}`,
  );

  const failures = [];
  if (targets.length < options.minFilenames) {
    failures.push(
      `unique filename count ${targets.length} is below required minimum ${options.minFilenames}`,
    );
  }
  if (nonImageApi.length > options.maxNonImageApi) {
    failures.push(
      `api 200 non-image count ${nonImageApi.length} exceeded threshold ${options.maxNonImageApi}`,
    );
  }
  if (nonImageLegacy.length > options.maxNonImageLegacy) {
    failures.push(
      `legacy 200 non-image count ${nonImageLegacy.length} exceeded threshold ${options.maxNonImageLegacy}`,
    );
  }
  if (probeErrors.length > options.maxProbeErrors) {
    failures.push(
      `probe error count ${probeErrors.length} exceeded threshold ${options.maxProbeErrors}`,
    );
  }

  if (failures.length > 0) {
    console.error(`[avatar-route-mime] FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }

  console.log('[avatar-route-mime] OK');
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[avatar-route-mime] FAILED: ${message}`);
  process.exit(1);
});
