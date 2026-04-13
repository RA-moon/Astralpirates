#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPlaceholderPathTokens } from './lib/docs-placeholder-path-tokens.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ACTIVE_DOC_FILES = [
  'README.md',
  'docs/README.md',
  'docs/project-overview.md',
  'docs/how-to-run.md',
  'docs/local-docker.md',
  'docs/testing.md',
  'docs/ci-workflow.md',
  'docs/release-checklist.md',
  'docs/launch-runbook.md',
  'docs/server-bootstrap.md',
  'docs/navigation.md',
  'docs/documentation-followups.md',
  'docs/planning/README.md',
  'docs/planning/roadmap-priorities.md',
  'docs/planning/plan-status-latest.md',
  'docs/planning/plan-log-index.md',
  'docs/planning/documentation-governance-hygiene.md',
  'frontend/README.md',
  'cms/README.md',
];

const ACTIVE_DOC_DIRS = [
  'docs/ops',
  'docs/architecture',
];

const ROOT_PATH_PREFIXES = [
  'docs/',
  'scripts/',
  'frontend/',
  'cms/',
  'shared/',
  'config/',
  'docker/',
  '.github/',
];

const ROOT_FILE_CANDIDATES = new Set([
  'README.md',
  'AGENTS.md',
  'CHANGELOG.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'docker-compose.yml',
]);

const OPTIONAL_PATH_PATTERNS = [
  /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/,
  /\.local\./,
  /^docs\/planning\/plans-export\/?$/,
];

const errors = [];

const toRelative = (fullPath) => path.relative(ROOT, fullPath).replace(/\\/g, '/');

const addError = (filePath, line, message) => {
  errors.push(`${filePath}:${line} ${message}`);
};

const fileExists = async (fullPath) => {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
};

const listMarkdownFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
};

const buildActiveDocList = async () => {
  const files = new Set();

  for (const relPath of ACTIVE_DOC_FILES) {
    const fullPath = path.join(ROOT, relPath);
    if (!(await fileExists(fullPath))) {
      addError(relPath, 1, 'Configured active doc file is missing.');
      continue;
    }
    files.add(fullPath);
  }

  for (const relDir of ACTIVE_DOC_DIRS) {
    const fullDir = path.join(ROOT, relDir);
    if (!(await fileExists(fullDir))) {
      addError(relDir, 1, 'Configured active doc directory is missing.');
      continue;
    }
    const markdownFiles = await listMarkdownFiles(fullDir);
    markdownFiles.forEach((fullPath) => files.add(fullPath));
  }

  return [...files].sort((a, b) => a.localeCompare(b));
};

const stripFragmentAndQuery = (target) => {
  let result = target;
  const hashIndex = result.indexOf('#');
  if (hashIndex >= 0) result = result.slice(0, hashIndex);
  const queryIndex = result.indexOf('?');
  if (queryIndex >= 0) result = result.slice(0, queryIndex);
  return result.trim();
};

const normalizeMarkdownTarget = (rawTarget) => {
  let target = rawTarget.trim();
  if (!target) return null;

  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }

  // Remove optional markdown link title suffix: (path "title")
  target = target
    .replace(/\s+"[^"]*"\s*$/, '')
    .replace(/\s+'[^']*'\s*$/, '')
    .trim();

  if (!target) return null;
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(target)) return null;
  if (target.startsWith('#')) return null;
  if (target.startsWith('/')) return null; // Website route, not a repo file path.

  const stripped = stripFragmentAndQuery(target);
  return stripped || null;
};

const seemsRepoRelative = (target) => {
  return ROOT_PATH_PREFIXES.some((prefix) => target.startsWith(prefix)) || ROOT_FILE_CANDIDATES.has(target);
};

const resolveLocalPath = async (docPath, target) => {
  const fromDoc = path.resolve(path.dirname(docPath), target);
  if (await fileExists(fromDoc)) return fromDoc;

  if (target.startsWith('./')) {
    const fromRootDot = path.resolve(ROOT, target.slice(2));
    if (await fileExists(fromRootDot)) return fromRootDot;

    // Many ops docs run commands from `/opt/astralpirates-cms/current`.
    // Map those host-relative CMS paths to the local `cms/` workspace for validation.
    const fromCmsWorkspace = path.resolve(ROOT, 'cms', target.slice(2));
    if (await fileExists(fromCmsWorkspace)) return fromCmsWorkspace;
  }

  if (seemsRepoRelative(target)) {
    const fromRoot = path.resolve(ROOT, target);
    if (await fileExists(fromRoot)) return fromRoot;
  }

  return null;
};

const lineNumberAt = (content, index) => content.slice(0, index).split(/\r?\n/).length;

const fencedCodeRanges = (content) => {
  const ranges = [];
  const regex = /```[\s\S]*?```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
};

const isInsideRange = (index, ranges) => ranges.some(([start, end]) => index >= start && index < end);

const sanitizeToken = (token) => {
  let value = token.trim();
  if (!value) return null;

  value = value.replace(/^[([{'"`]+/, '').replace(/[)\]}'"`,.;:!?]+$/, '');

  // Strip line/anchor suffixes often used in references.
  value = value.replace(/#L\d+(?::\d+)?$/i, '');
  value = value.replace(/:\d+(?::\d+)?$/, '');

  return value || null;
};

const shouldCheckInlineToken = (token) => {
  if (!token) return false;
  if (token.startsWith('/')) return false; // host/runtime absolute paths
  if (token.startsWith('-') || token.startsWith('$')) return false;
  if (token.includes('=')) return false;
  if (token.includes('://')) return false;
  if (/[<>*{}|]/.test(token) || token.includes('...')) return false;
  if (token.startsWith('@')) return false;
  if (token.startsWith('src/') || token.startsWith('test/')) return false;

  if (token.startsWith('./') || token.startsWith('../')) return true;
  if (ROOT_FILE_CANDIDATES.has(token)) return true;
  if (seemsRepoRelative(token)) return true;

  return false;
};

const isOptionalPathReference = (token) => OPTIONAL_PATH_PATTERNS.some((pattern) => pattern.test(token));

const lintMarkdownLinks = async (docFullPath, contents, relPath) => {
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(contents)) !== null) {
    const rawTarget = match[1] ?? '';
    const target = normalizeMarkdownTarget(rawTarget);
    if (!target) continue;

    const resolved = await resolveLocalPath(docFullPath, target);
    if (!resolved) {
      addError(relPath, lineNumberAt(contents, match.index), `Broken markdown link target: ${target}`);
    }
  }
};

const lintInlineCodePaths = async (docFullPath, contents, relPath) => {
  const ranges = fencedCodeRanges(contents);
  const inlineCodeRegex = /`([^`\n]+)`/g;

  let match;
  while ((match = inlineCodeRegex.exec(contents)) !== null) {
    if (isInsideRange(match.index, ranges)) continue;

    const inlineCode = match[1]?.trim() ?? '';
    if (!inlineCode) continue;

    const tokens = inlineCode.split(/\s+/).map(sanitizeToken).filter(Boolean);
    for (const token of tokens) {
      if (!shouldCheckInlineToken(token)) continue;
      if (isOptionalPathReference(token)) continue;

      const resolved = await resolveLocalPath(docFullPath, token);
      if (!resolved) {
        addError(relPath, lineNumberAt(contents, match.index), `Backtick path does not resolve: ${token}`);
      }
    }
  }
};

const lintPlaceholderPathTokens = (contents, relPath) => {
  if (!relPath.endsWith('.md')) return;

  const matches = findPlaceholderPathTokens(contents);
  for (const match of matches) {
    addError(
      relPath,
      lineNumberAt(contents, match.index),
      `Placeholder docs path token is not allowed in active docs: ${match.token}`,
    );
  }
};

const main = async () => {
  const docFiles = await buildActiveDocList();

  await Promise.all(
    docFiles.map(async (docFullPath) => {
      const relPath = toRelative(docFullPath);
      const contents = await fs.readFile(docFullPath, 'utf8');
      await lintMarkdownLinks(docFullPath, contents, relPath);
      await lintInlineCodePaths(docFullPath, contents, relPath);
      lintPlaceholderPathTokens(contents, relPath);
    }),
  );

  if (errors.length) {
    errors.forEach((error) => console.error(`[docs-lint] ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`[docs-lint] OK — validated ${docFiles.length} active docs.`);
};

main().catch((error) => {
  console.error('[docs-lint] Unexpected failure:', error);
  process.exitCode = 1;
});
