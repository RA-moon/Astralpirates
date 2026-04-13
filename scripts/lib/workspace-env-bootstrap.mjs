import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFiles } from '@astralpirates/shared/env';

export const resolveWorkspacePathsFromModule = (moduleUrl) => {
  const scriptDir = path.dirname(fileURLToPath(moduleUrl));
  const workspaceRoot = path.resolve(scriptDir, '..');
  return {
    workspaceRoot,
    cmsDir: path.join(workspaceRoot, 'cms'),
    frontendDir: path.join(workspaceRoot, 'frontend'),
  };
};

export const buildWorkspaceEnvPaths = ({ workspaceRoot, cmsDir, frontendDir }) => [
  path.join(workspaceRoot, '.env.local'),
  path.join(workspaceRoot, '.env.shared'),
  path.join(workspaceRoot, '.env'),
  path.join(cmsDir, '.env.local'),
  path.join(cmsDir, '.env'),
  path.join(frontendDir, '.env.local'),
  path.join(frontendDir, '.env'),
];

export const loadWorkspaceEnvFiles = (moduleUrl) => {
  const paths = resolveWorkspacePathsFromModule(moduleUrl);
  loadEnvFiles({
    paths: buildWorkspaceEnvPaths(paths),
  });
  return paths;
};
