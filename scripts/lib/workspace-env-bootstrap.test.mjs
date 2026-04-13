import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { buildWorkspaceEnvPaths } from './workspace-env-bootstrap.mjs';

test('buildWorkspaceEnvPaths returns workspace, cms, and frontend env files in stable order', () => {
  const paths = buildWorkspaceEnvPaths({
    workspaceRoot: '/repo',
    cmsDir: '/repo/cms',
    frontendDir: '/repo/frontend',
  });

  assert.deepEqual(paths, [
    path.join('/repo', '.env.local'),
    path.join('/repo', '.env.shared'),
    path.join('/repo', '.env'),
    path.join('/repo/cms', '.env.local'),
    path.join('/repo/cms', '.env'),
    path.join('/repo/frontend', '.env.local'),
    path.join('/repo/frontend', '.env'),
  ]);
});
