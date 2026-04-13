#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';

import { applyReportCliArgs } from './lib/report-cli-options.mjs';
import { runAuthzTelemetryEvidenceCheck } from './lib/authz-telemetry-evidence.mjs';

const DEFAULT_BASE_URL = 'https://astralpirates.com';
const DEFAULT_METRICS_PATH = '/api/ship-status/metrics';
const DEFAULT_INTERNAL_SCOPE = 'internal';
const DEFAULT_TIMEOUT_MS = 20_000;

const usage = () => {
  console.log(`Usage: node scripts/check-authz-telemetry-evidence.mjs [options]

Produces machine-readable WS6.E telemetry evidence by:
1) capturing internal metrics snapshot (authorized),
2) triggering one denied admin decision (unauthenticated internal probe),
3) triggering one elevated allow admin decision (authorized internal probe with admin-view header),
4) asserting counter deltas and emitting a JSON artifact.

Options:
  --base <url>                  Base URL (default: ${DEFAULT_BASE_URL})
  --metrics-path <path>         Metrics path (default: ${DEFAULT_METRICS_PATH})
  --scope <value>               Internal scope query value (default: ${DEFAULT_INTERNAL_SCOPE})
  --token <token>               Bearer token for internal metrics (or env AUTHZ_TELEMETRY_PROBE_TOKEN, MEDIA_INTEGRITY_PROBE_TOKEN, CMS_AUTH_TOKEN)
  --email <email>               Login email fallback (or env AUTHZ_TELEMETRY_PROBE_EMAIL, MEDIA_INTEGRITY_PROBE_EMAIL)
  --password <password>         Login password fallback (or env AUTHZ_TELEMETRY_PROBE_PASSWORD, MEDIA_INTEGRITY_PROBE_PASSWORD)
  --timeout-ms <ms>             Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --out <path>                  Optional JSON output path
  -h, --help                    Show this help
`);
};

const asPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const options = {
  base: process.env.AUTHZ_TELEMETRY_PROBE_BASE_URL || DEFAULT_BASE_URL,
  metricsPath: process.env.AUTHZ_TELEMETRY_METRICS_PATH || DEFAULT_METRICS_PATH,
  scope: process.env.AUTHZ_TELEMETRY_INTERNAL_SCOPE || DEFAULT_INTERNAL_SCOPE,
  token:
    process.env.AUTHZ_TELEMETRY_PROBE_TOKEN ||
    process.env.MEDIA_INTEGRITY_PROBE_TOKEN ||
    process.env.CMS_AUTH_TOKEN ||
    '',
  email: process.env.AUTHZ_TELEMETRY_PROBE_EMAIL || process.env.MEDIA_INTEGRITY_PROBE_EMAIL || '',
  password:
    process.env.AUTHZ_TELEMETRY_PROBE_PASSWORD || process.env.MEDIA_INTEGRITY_PROBE_PASSWORD || '',
  timeoutMs: asPositiveInt(process.env.AUTHZ_TELEMETRY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  out: process.env.AUTHZ_TELEMETRY_OUTPUT || '',
};

const { helpRequested } = applyReportCliArgs({
  argv: process.argv.slice(2),
  options,
  valueFlags: {
    '--base': 'base',
    '--metrics-path': 'metricsPath',
    '--scope': 'scope',
    '--token': 'token',
    '--email': 'email',
    '--password': 'password',
    '--timeout-ms': 'timeoutMs',
    '--out': 'out',
  },
  strictUnknown: true,
});

if (helpRequested) {
  usage();
  process.exit(0);
}

options.timeoutMs = asPositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);

const run = async () => {
  const result = await runAuthzTelemetryEvidenceCheck({
    baseUrl: options.base,
    metricsPath: options.metricsPath,
    internalScope: options.scope,
    token: options.token,
    email: options.email,
    password: options.password,
    timeoutMs: options.timeoutMs,
  });

  if (options.out && String(options.out).trim()) {
    await fs.writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`[authz-telemetry-evidence] wrote ${options.out}`);
  }

  console.log(
    `[authz-telemetry-evidence] ok denyDelta=${result.telemetry.deltas.denyEvents} elevatedDelta=${result.telemetry.deltas.elevatedAllowEvents}`,
  );
  console.log(JSON.stringify(result));
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[authz-telemetry-evidence] ${message}`);
  process.exit(1);
});
