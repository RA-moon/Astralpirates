import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_AGE_DAYS = 7;
const ROADMAP_DOC_RELATIVE_PATH = 'docs/planning/roadmap-priorities.md';
const PLANNING_DOCS_DIR = path.join(ROOT, 'docs', 'planning');
const errors = [];
const warnings = [];

const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);
const toRelativePath = (fullPath) => path.relative(ROOT, fullPath).replace(/\\/g, '/');

const collectMarkdownFiles = async (dir) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files;
  } catch (error) {
    addError(`Failed to walk markdown files in ${toRelativePath(dir)}: ${error.message}`);
    return [];
  }
};

const readJsonFile = async (relativePath) => {
  const fullPath = path.join(ROOT, relativePath);
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    addError(`Failed to read ${relativePath}: ${error.message}`);
    return null;
  }
};

const ensureFresh = (isoTimestamp, label) => {
  if (!isoTimestamp) {
    addError(`${label} is missing generatedAt metadata.`);
    return;
  }
  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) {
    addError(`${label} has an invalid generatedAt value: ${isoTimestamp}`);
    return;
  }
  const ageMs = Date.now() - timestamp.getTime();
  if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
    addError(`${label} is older than ${MAX_AGE_DAYS} days. Regenerate artifacts before deploying.`);
  }
};

const validateNavigation = async () => {
  const data = await readJsonFile('frontend/public/navigation.json');
  if (!data) return;

  ensureFresh(data.generatedAt, 'frontend/public/navigation.json');
  if (!Array.isArray(data.links) || data.links.length === 0) {
    addError('frontend/public/navigation.json is missing the "links" array or it is empty.');
    return;
  }

  const seenHrefs = new Set();
  data.links.forEach((link, index) => {
    if (!link || typeof link !== 'object') {
      addError(`Navigation entry #${index + 1} is not an object.`);
      return;
    }
    const { label, href } = link;
    if (typeof label !== 'string' || label.trim().length === 0) {
      addError(`Navigation entry "${JSON.stringify(link)}" is missing a readable label.`);
    }
    if (typeof href !== 'string' || href.trim().length === 0) {
      addError(`Navigation entry "${label ?? index + 1}" is missing an href.`);
      return;
    }
    const trimmedHref = href.trim();
    const absolute = /^https?:\/\//i.test(trimmedHref);
    if (!absolute && !trimmedHref.startsWith('/')) {
      addWarning(`Navigation href "${trimmedHref}" is relative; ensure consumers can resolve it.`);
    }
    if (seenHrefs.has(trimmedHref)) {
      addWarning(`Navigation href "${trimmedHref}" appears multiple times.`);
    } else {
      seenHrefs.add(trimmedHref);
    }
  });
};

const validateRoadmap = async () => {
  const data = await readJsonFile('frontend/app/generated/roadmap.json');
  if (!data) return;

  ensureFresh(data.generatedAt, 'frontend/app/generated/roadmap.json');

  if (!Array.isArray(data.tiers) || data.tiers.length === 0) {
    addError('frontend/app/generated/roadmap.json is missing "tiers" data.');
    return;
  }

  data.tiers.forEach((tier) => {
    if (!tier || typeof tier !== 'object') {
      addError('Roadmap contains a tier entry that is not an object.');
      return;
    }
    if (typeof tier.id !== 'string' || tier.id.trim().length === 0) {
      addError(`Roadmap tier "${tier.title ?? '<unknown>'}" is missing an id.`);
    }
    if (!Array.isArray(tier.items) || tier.items.length === 0) {
      addWarning(`Roadmap tier "${tier.title ?? tier.id}" does not list any items.`);
      return;
    }
    tier.items.forEach((item) => {
      if (!item || typeof item !== 'object') {
        addError('Roadmap includes an item that is not an object.');
        return;
      }
      const missing = [];
      if (typeof item.title !== 'string' || item.title.trim().length === 0) missing.push('title');
      if (typeof item.status !== 'string' || item.status.trim().length === 0) missing.push('status');
      if (typeof item.cloudStatus !== 'string' || item.cloudStatus.trim().length === 0) missing.push('cloudStatus');
      if (missing.length) {
        addError(`Roadmap item "${item.title ?? '<unknown>'}" is missing fields: ${missing.join(', ')}.`);
      }
    });
  });
};

const validatePlanStatusDoc = async () => {
  const relativePath = 'docs/planning/plan-status-latest.md';
  const fullPath = path.join(ROOT, relativePath);
  try {
    const contents = await fs.readFile(fullPath, 'utf8');
    if (!contents.includes('# Plan Status')) {
      addError(`${relativePath} is missing the "Plan Status" heading.`);
    }
    const match = contents.match(/Plan Status\s+—\s+(\d{4}-\d{2}-\d{2})/);
    if (match) {
      ensureFresh(new Date(match[1]).toISOString(), relativePath);
    } else {
      addWarning(`Could not determine the snapshot date inside ${relativePath}.`);
    }
  } catch (error) {
    addError(`Failed to read ${relativePath}: ${error.message}`);
  }
};

const parseStatusCounts = (value) => {
  const source = typeof value === 'string' ? value : '';
  const counts = {};
  const shipped = source.match(/✅\s*(\d+)\s*shipped/i);
  const active = source.match(/⚙️\s*(\d+)\s*active/i);
  const queued = source.match(/🧭\s*(\d+)\s*queued/i);
  if (shipped) counts.shipped = Number(shipped[1]);
  if (active) counts.active = Number(active[1]);
  if (queued) counts.queued = Number(queued[1]);
  return counts;
};

const resolveSectionStatus = (line) => {
  if (/^###\s+⚙️\s+Active\b/.test(line)) return 'active';
  if (/^###\s+✅\s+Shipped\b/.test(line)) return 'shipped';
  if (/^###\s+🧭\s+Queued\b/.test(line)) return 'queued';
  return null;
};

const ensureTierCountBucket = (map, tierId) => {
  if (!map.has(tierId)) {
    map.set(tierId, { shipped: 0, active: 0, queued: 0 });
  }
  return map.get(tierId);
};

const compareDeclaredCounts = (sourceLabel, tierId, lineNumber, declaredCounts, actualCounts) => {
  for (const [status, expected] of Object.entries(declaredCounts)) {
    if (!['shipped', 'active', 'queued'].includes(status)) continue;
    const actual = actualCounts[status] ?? 0;
    if (actual !== expected) {
      addError(
        `${ROADMAP_DOC_RELATIVE_PATH}:${lineNumber} ${sourceLabel} for ${tierId} says ${status}=${expected}, but roadmap-item metadata counts ${actual}.`,
      );
    }
  }
};

const validateRoadmapDocument = async () => {
  const fullPath = path.join(ROOT, ROADMAP_DOC_RELATIVE_PATH);
  let contents = '';
  try {
    contents = await fs.readFile(fullPath, 'utf8');
  } catch (error) {
    addError(`Failed to read ${ROADMAP_DOC_RELATIVE_PATH}: ${error.message}`);
    return;
  }

  const lines = contents.split(/\r?\n/);
  const actualCountsByTier = new Map();
  const sectionStatusByTier = new Map();
  const tableStatusByTier = new Map();
  let currentTier = null;
  let currentSectionStatus = null;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    const tierHeadingMatch = line.match(/^##\s+Tier\s+(\d+)\b/i);
    if (tierHeadingMatch) {
      currentTier = `tier${tierHeadingMatch[1]}`;
      currentSectionStatus = null;
      ensureTierCountBucket(actualCountsByTier, currentTier);
      continue;
    }

    if (currentTier && line.startsWith('**Status:**')) {
      sectionStatusByTier.set(currentTier, {
        counts: parseStatusCounts(line),
        lineNumber: i + 1,
      });
      continue;
    }

    const tableRowMatch = rawLine.match(/^\|\s*Tier\s+(\d+)[^|]*\|[^|]*\|([^|]+)\|\s*$/);
    if (tableRowMatch) {
      const tierId = `tier${tableRowMatch[1]}`;
      tableStatusByTier.set(tierId, {
        counts: parseStatusCounts(tableRowMatch[2]),
        lineNumber: i + 1,
      });
      continue;
    }

    const nextSectionStatus = resolveSectionStatus(line);
    if (nextSectionStatus) {
      currentSectionStatus = nextSectionStatus;
      continue;
    }

    if (line !== '<!-- roadmap-item') continue;
    if (!currentTier) {
      addError(`${ROADMAP_DOC_RELATIVE_PATH}:${i + 1} roadmap-item block is outside a tier section.`);
      continue;
    }

    let blockStatus = null;
    let blockTier = null;
    let cursor = i + 1;
    while (cursor < lines.length) {
      const blockLine = lines[cursor].trim();
      if (blockLine === '-->') break;

      const statusMatch = blockLine.match(/^status:\s*([a-z-]+)/i);
      if (statusMatch) blockStatus = statusMatch[1].toLowerCase();

      const tierMatch = blockLine.match(/^tier:\s*(tier\d+)/i);
      if (tierMatch) blockTier = tierMatch[1].toLowerCase();

      cursor += 1;
    }

    if (cursor >= lines.length || lines[cursor].trim() !== '-->') {
      addError(`${ROADMAP_DOC_RELATIVE_PATH}:${i + 1} has an unterminated roadmap-item block.`);
      break;
    }

    if (blockTier && blockTier !== currentTier) {
      addError(
        `${ROADMAP_DOC_RELATIVE_PATH}:${i + 1} roadmap-item tier=${blockTier} is inside ${currentTier}.`,
      );
    }

    if (!blockStatus) {
      addWarning(`${ROADMAP_DOC_RELATIVE_PATH}:${i + 1} roadmap-item block is missing a status field.`);
    } else if (!['active', 'queued', 'shipped'].includes(blockStatus)) {
      addWarning(`${ROADMAP_DOC_RELATIVE_PATH}:${i + 1} roadmap-item uses non-standard status "${blockStatus}".`);
    } else {
      const counts = ensureTierCountBucket(actualCountsByTier, currentTier);
      counts[blockStatus] += 1;

      if (currentSectionStatus && blockStatus !== currentSectionStatus) {
        addError(
          `${ROADMAP_DOC_RELATIVE_PATH}:${i + 1} roadmap-item status=${blockStatus} appears under the ${currentSectionStatus} section.`,
        );
      }
    }

    i = cursor;
  }

  for (const [tierId, declared] of sectionStatusByTier.entries()) {
    compareDeclaredCounts(
      'Tier status line',
      tierId,
      declared.lineNumber,
      declared.counts,
      ensureTierCountBucket(actualCountsByTier, tierId),
    );
  }

  for (const [tierId, declared] of tableStatusByTier.entries()) {
    compareDeclaredCounts(
      'Tier snapshot row',
      tierId,
      declared.lineNumber,
      declared.counts,
      ensureTierCountBucket(actualCountsByTier, tierId),
    );
  }
};

const validatePlanningMetadataDates = async () => {
  const files = await collectMarkdownFiles(PLANNING_DOCS_DIR);
  if (!files.length) return;

  const today = new Date().toISOString().slice(0, 10);

  await Promise.all(
    files.map(async (filePath) => {
      const relativePath = toRelativePath(filePath);
      let contents = '';
      try {
        contents = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        addError(`Failed to read ${relativePath}: ${error.message}`);
        return;
      }

      const frontmatterMatch = contents.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return;

      const frontmatter = frontmatterMatch[1];
      if (!/\btype:\s*(plan|roadmap)\b/i.test(frontmatter)) return;

      const lastUpdatedMatch = frontmatter.match(/\blastUpdated:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?/);
      if (!lastUpdatedMatch) {
        addWarning(`${relativePath} is missing meta.lastUpdated.`);
        return;
      }

      const lastUpdated = lastUpdatedMatch[1];
      const timestamp = Date.parse(`${lastUpdated}T00:00:00Z`);
      if (Number.isNaN(timestamp)) {
        addError(`${relativePath} has an invalid lastUpdated value: ${lastUpdated}`);
        return;
      }

      if (lastUpdated > today) {
        addError(`${relativePath} has future lastUpdated ${lastUpdated}; expected <= ${today}.`);
      }
    }),
  );
};

const main = async () => {
  await Promise.all([
    validateNavigation(),
    validateRoadmap(),
    validatePlanStatusDoc(),
    validateRoadmapDocument(),
    validatePlanningMetadataDates(),
  ]);

  warnings.forEach((warning) => {
    console.warn(`[validate-structure] Warning: ${warning}`);
  });

  if (errors.length > 0) {
    errors.forEach((error) => {
      console.error(`[validate-structure] Error: ${error}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log('[validate-structure] OK — navigation, roadmap, and plan-status artifacts look healthy.');
};

main().catch((error) => {
  console.error('[validate-structure] Unexpected failure:', error);
  process.exitCode = 1;
});
