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
const DEFAULT_MIN_SUCCESSFUL = 1;
const DEFAULT_MAX_PROBE_ERRORS = 0;
const DEFAULT_MAX_SAMPLE = 12;

const usage = () => {
  console.log(`Usage: node scripts/check-avatar-route-health.mjs [options]

Checks avatar route health using live crew avatar filenames.

Success condition:
  - At least --min-successful filenames return image bytes on both routes:
    - /api/avatars/file/<filename>
    - /media/avatars/<filename>

Options:
  --base <url>                     Base URL (default: ${DEFAULT_BASE_URL})
  --crew-url <url>                 Crew API endpoint (default: /api/crew?limit=500 on base)
  --filename <filename>            Additional avatar filename to probe (repeatable)
  --internal-host <host>           Internal host filter (default: derived from --base)
  --timeout-ms <ms>                Probe timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --min-successful <n>             Minimum successful route pairs required (default: ${DEFAULT_MIN_SUCCESSFUL})
  --max-probe-errors <n>           Allowed probe transport failures (status=0) (default: ${DEFAULT_MAX_PROBE_ERRORS})
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
      minSuccessful: DEFAULT_MIN_SUCCESSFUL,
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
      '--min-successful': {
        key: 'minSuccessful',
        fallback: DEFAULT_MIN_SUCCESSFUL,
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

const run = async () => {
  const options = parseArgs();

  console.log(`[avatar-route-health] base=${options.baseUrl.origin}`);
  console.log(`[avatar-route-health] crew=${options.crewUrl.toString()}`);
  console.log(`[avatar-route-health] internalHost=${options.internalHost}`);

  const targets = await resolveAvatarRouteTargets({
    crewUrl: options.crewUrl,
    timeoutMs: options.timeoutMs,
    internalHost: options.internalHost,
    extraFilenames: options.filenames,
    userAgent: 'astral-avatar-route-health-check',
  });
  console.log(`[avatar-route-health] uniqueFilenames=${targets.length}`);

  if (targets.length === 0) {
    console.log('[avatar-route-health] no internal avatar filenames discovered; skipping strict success requirement.');
    console.log('[avatar-route-health] OK');
    return;
  }

  const failures = [];
  const probeErrors = [];
  let successfulRoutePairs = 0;

  for (const filename of targets) {
    const encoded = encodePathSegments(filename);
    const apiUrl = new URL(`/api/avatars/file/${encoded}`, options.baseUrl).toString();
    const legacyUrl = new URL(`/media/avatars/${encoded}`, options.baseUrl).toString();

    const apiProbe = await probeImageRoute({
      url: apiUrl,
      timeoutMs: options.timeoutMs,
      userAgent: 'astral-avatar-route-health-check',
    });
    const legacyProbe = await probeImageRoute({
      url: legacyUrl,
      timeoutMs: options.timeoutMs,
      userAgent: 'astral-avatar-route-health-check',
    });

    if (apiProbe.status === 0 || legacyProbe.status === 0) {
      probeErrors.push({ filename, apiProbe, legacyProbe });
    }

    const apiOk = (apiProbe.status === 200 || apiProbe.status === 206) && apiProbe.isImage;
    const legacyOk = (legacyProbe.status === 200 || legacyProbe.status === 206) && legacyProbe.isImage;
    if (apiOk && legacyOk) {
      successfulRoutePairs += 1;
      continue;
    }

    failures.push({ filename, apiUrl, legacyUrl, apiProbe, legacyProbe });
  }

  console.log(
    `[avatar-route-health] counts successfulRoutePairs=${successfulRoutePairs}` +
      ` failures=${failures.length}` +
      ` probeErrors=${probeErrors.length}`,
  );

  if (failures.length > 0) {
    console.log('[avatar-route-health] failure sample:');
    for (const entry of failures.slice(0, options.maxSample)) {
      console.log(
        `  - ${entry.filename}` +
          ` api(status=${entry.apiProbe.status},type=${entry.apiProbe.contentType ?? '-'})` +
          ` legacy(status=${entry.legacyProbe.status},type=${entry.legacyProbe.contentType ?? '-'})` +
          ` apiUrl=${entry.apiUrl}` +
          ` legacyUrl=${entry.legacyUrl}`,
      );
    }
  }

  if (probeErrors.length > 0) {
    console.log('[avatar-route-health] probe error sample:');
    for (const entry of probeErrors.slice(0, options.maxSample)) {
      console.log(
        `  - ${entry.filename}` +
          ` api=${entry.apiProbe.error ?? '-'}` +
          ` legacy=${entry.legacyProbe.error ?? '-'}`,
      );
    }
  }

  const errors = [];
  if (successfulRoutePairs < options.minSuccessful) {
    errors.push(
      `successful route pairs ${successfulRoutePairs} are below required minimum ${options.minSuccessful}`,
    );
  }
  if (probeErrors.length > options.maxProbeErrors) {
    errors.push(
      `probe error count ${probeErrors.length} exceeded threshold ${options.maxProbeErrors}`,
    );
  }

  if (errors.length > 0) {
    console.error(`[avatar-route-health] FAILED: ${errors.join('; ')}`);
    process.exit(1);
  }

  console.log('[avatar-route-health] OK');
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[avatar-route-health] FAILED: ${message}`);
  process.exit(1);
});
