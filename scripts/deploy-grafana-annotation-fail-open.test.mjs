import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const deployScriptPath = path.join(here, 'deploy.sh');

const GRAFANA_BLOCK_START = 'if [[ -n "$GRAFANA_URL" && -n "$GRAFANA_TOKEN" ]]; then';
const GRAFANA_BLOCK_END = '\nif [[ -n "$SLACK_WEBHOOK" ]]; then';

function extractGrafanaBlock(scriptSource) {
  const start = scriptSource.indexOf(GRAFANA_BLOCK_START);
  assert.notEqual(start, -1, 'Unable to locate Grafana annotation block start in deploy.sh');

  const end = scriptSource.indexOf(GRAFANA_BLOCK_END, start);
  assert.notEqual(end, -1, 'Unable to locate Grafana annotation block end in deploy.sh');

  return scriptSource.slice(start, end).trimEnd();
}

test('deploy.sh Grafana block keeps curl assignment inside if and avoids set +e fallback', async () => {
  const deployScript = await readFile(deployScriptPath, 'utf8');
  const grafanaBlock = extractGrafanaBlock(deployScript);

  assert.match(
    grafanaBlock,
    /if grafana_http_code=\$\(curl -sS[\s\S]*\); then/,
    'Expected curl assignment to run in if-condition to avoid ERR-trap exits',
  );
  assert.match(
    grafanaBlock,
    /grafana_curl_exit=\$\?/,
    'Expected failed curl exit code capture for non-blocking diagnostics',
  );
  assert.doesNotMatch(
    grafanaBlock,
    /set \+e/,
    'Grafana block should not rely on set +e toggles under ERR trap',
  );
});

test('Grafana annotation failure remains non-blocking even with ERR trap enabled', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'deploy-grafana-fail-open-'));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const deployScript = await readFile(deployScriptPath, 'utf8');
  const grafanaBlock = extractGrafanaBlock(deployScript);

  const binDir = path.join(tempRoot, 'bin');
  const fakeCurlPath = path.join(binDir, 'curl');
  const harnessPath = path.join(tempRoot, 'harness.sh');
  await mkdir(binDir, { recursive: true });

  await writeFile(
    fakeCurlPath,
    '#!/usr/bin/env bash\n' +
      'exit 6\n',
    'utf8',
  );
  await writeFile(
    harnessPath,
    `#!/usr/bin/env bash
set -eEuo pipefail
trap 'echo "__ERR_TRAP__" >&2; exit 99' ERR

export PATH="${binDir}:$PATH"

LOG_DIR="${tempRoot}"
DEPLOYMENT_ID="deploy-test"
GIT_SHA="deadbeef"
DEPLOY_INITIATOR="tester"
RUN_URL=""
BRANCH="main"
GRAFANA_URL="https://grafana.example.invalid/api/annotations"
GRAFANA_TOKEN="test-token"
GRAFANA_CONNECT_TIMEOUT_SECONDS="1"
GRAFANA_MAX_TIME_SECONDS="1"

json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}

${grafanaBlock}

echo "__HARNESS_OK__"
`,
    'utf8',
  );

  const chmodCurl = spawnSync('chmod', ['+x', fakeCurlPath], { encoding: 'utf8' });
  assert.equal(chmodCurl.status, 0, chmodCurl.stderr);
  const chmodHarness = spawnSync('chmod', ['+x', harnessPath], { encoding: 'utf8' });
  assert.equal(chmodHarness.status, 0, chmodHarness.stderr);

  const run = spawnSync('bash', [harnessPath], { encoding: 'utf8' });
  const combined = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combined);
  assert.match(combined, /Grafana annotation failed \(non-blocking\): curl_exit=6/);
  assert.match(combined, /__HARNESS_OK__/);
  assert.doesNotMatch(combined, /__ERR_TRAP__/);
}
);
