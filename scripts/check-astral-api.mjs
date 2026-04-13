import process from 'node:process';
import { resolveFrontendEnv } from '@astralpirates/shared/env';
import { applyReportCliArgs, findFirstPositionalArg } from './lib/report-cli-options.mjs';
import { loadWorkspaceEnvFiles } from './lib/workspace-env-bootstrap.mjs';

loadWorkspaceEnvFiles(import.meta.url);

const args = process.argv.slice(2);
const cliOptions = {
  expectedOriginArg: '',
  warnOnly: false,
};
const valueFlags = {
  '--origin': 'expectedOriginArg',
};
const booleanFlags = {
  '--warn-only': 'warnOnly',
};

applyReportCliArgs({
  argv: args,
  options: cliOptions,
  valueFlags,
  booleanFlags,
});

if (!cliOptions.expectedOriginArg) {
  cliOptions.expectedOriginArg = findFirstPositionalArg({
    argv: args,
    valueFlags,
    booleanFlags,
  });
}

const expectedOrigin =
  cliOptions.expectedOriginArg ||
  process.env.FRONTEND_ORIGIN ||
  `http://localhost:${process.env.NUXT_PORT || 8080}`;
const { astralApiBase } = resolveFrontendEnv({ enforceStrict: false });
const apiBase = astralApiBase || 'http://localhost:3000';

let healthUrl;
try {
  healthUrl = new URL('/api/profiles/health', apiBase).toString();
} catch (error) {
  const message = `[check-astral-api] Invalid API base URL "${apiBase}".`;
  if (cliOptions.warnOnly) {
    console.warn(message);
    console.warn(error);
    process.exit(0);
  } else {
    console.error(message);
    process.exitCode = 1;
    throw error;
  }
}

try {
  const response = await fetch(healthUrl, {
    headers: {
      Origin: expectedOrigin,
    },
  });

  if (!response.ok) {
    const message = `[check-astral-api] Unexpected status ${response.status} from ${healthUrl}. Expected 200.`;
    if (cliOptions.warnOnly) {
      console.warn(message);
      process.exit(0);
    } else {
      console.error(message);
      process.exitCode = 1;
      process.exit();
    }
  }

  const allowOrigin = response.headers.get('access-control-allow-origin');
  if (allowOrigin !== expectedOrigin) {
    const message = `[check-astral-api] Access-Control-Allow-Origin mismatch. Expected "${expectedOrigin}" but received "${allowOrigin ?? 'null'}".`;
    if (cliOptions.warnOnly) {
      console.warn(message);
      process.exit(0);
    } else {
      console.error(message);
      process.exitCode = 1;
      process.exit();
    }
  }

  console.log(
    `[check-astral-api] OK – ${healthUrl} responded with 200 and Access-Control-Allow-Origin "${allowOrigin}".`,
  );
} catch (error) {
  const message = `[check-astral-api] Request to ${healthUrl} failed:`;
  if (cliOptions.warnOnly) {
    console.warn(message, error);
    process.exit(0);
  } else {
    console.error(message, error);
    process.exitCode = 1;
  }
}
