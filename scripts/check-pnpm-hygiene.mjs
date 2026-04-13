import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..');

const readGitLines = (args, { allowFailure = false } = {}) => {
  try {
    const output = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (!output) return [];
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    if (allowFailure) return [];
    console.error(`Failed to run: git ${args.join(' ')}`);
    throw error;
  }
};

const tracked = readGitLines(['ls-files']);
const untracked = readGitLines(['ls-files', '--others', '--exclude-standard'], { allowFailure: true });
const files = new Set([...tracked, ...untracked]);
const forbiddenRootArtifacts = new Set(['=']);

const lockfiles = [];
const workspaceFiles = [];

for (const file of files) {
  const base = path.posix.basename(file.replaceAll(path.sep, path.posix.sep));
  if (base === 'pnpm-lock.yaml') lockfiles.push(file);
  if (base === 'pnpm-workspace.yaml') workspaceFiles.push(file);
}

const unexpectedLockfiles = lockfiles.filter((file) => file !== 'pnpm-lock.yaml');
const unexpectedWorkspaces = workspaceFiles.filter((file) => file !== 'pnpm-workspace.yaml');
const unexpectedRootArtifacts = [...files]
  .filter((file) => !file.includes('/'))
  .filter((file) => forbiddenRootArtifacts.has(file));

const missingRoot = [];
if (!files.has('pnpm-lock.yaml')) missingRoot.push('pnpm-lock.yaml');
if (!files.has('pnpm-workspace.yaml')) missingRoot.push('pnpm-workspace.yaml');

if (missingRoot.length || unexpectedLockfiles.length || unexpectedWorkspaces.length || unexpectedRootArtifacts.length) {
  console.error('pnpm workspace hygiene check failed.');
  if (missingRoot.length) {
    console.error('\nMissing required root pnpm files:');
    for (const file of missingRoot) console.error(`- ${file}`);
  }
  if (unexpectedLockfiles.length) {
    console.error('\nUnexpected nested pnpm lockfiles (only root pnpm-lock.yaml is allowed):');
    for (const file of unexpectedLockfiles.sort()) console.error(`- ${file}`);
  }
  if (unexpectedWorkspaces.length) {
    console.error('\nUnexpected nested pnpm workspace configs (only root pnpm-workspace.yaml is allowed):');
    for (const file of unexpectedWorkspaces.sort()) console.error(`- ${file}`);
  }
  if (unexpectedRootArtifacts.length) {
    console.error('\nUnexpected root artifact files:');
    for (const file of unexpectedRootArtifacts.sort()) console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('pnpm workspace hygiene check passed.');
