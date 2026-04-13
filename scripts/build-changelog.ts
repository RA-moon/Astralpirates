import { promises as fs } from 'node:fs';
import path from 'node:path';

type ChangelogRelease = {
  id: string;
  version: string;
  title: string;
  entries: string[];
};

type ChangelogSnapshot = {
  generatedAt: string;
  releases: ChangelogRelease[];
};

const ROOT = process.cwd();
const CHANGELOG_SOURCE = path.join(ROOT, 'CHANGELOG.md');
const CHANGELOG_OUTPUT = path.join(ROOT, 'frontend/app/generated/changelog.json');

async function main() {
  const source = await fs.readFile(CHANGELOG_SOURCE, 'utf8');
  const releases = parseChangelog(source);
  if (releases.length === 0) {
    throw new Error('No releases found in CHANGELOG.md');
  }

  const snapshot: ChangelogSnapshot = {
    generatedAt: new Date().toISOString(),
    releases,
  };

  await fs.mkdir(path.dirname(CHANGELOG_OUTPUT), { recursive: true });
  await fs.writeFile(CHANGELOG_OUTPUT, JSON.stringify(snapshot, null, 2), 'utf8');
}

function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  const lines = markdown.split(/\r?\n/);
  let current: ChangelogRelease | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;
    if (line.startsWith('# ')) continue;

    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      if (current) {
        releases.push(current);
      }
      const version = headingMatch[1].trim();
      current = {
        id: toId(version),
        version,
        title: version,
        entries: [],
      };
      continue;
    }

    if (!current) continue;

    const bulletMatch = rawLine.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      current.entries.push(bulletMatch[1].trim());
      continue;
    }

    if (current.entries.length > 0 && rawLine.startsWith('  ') && rawLine.trim()) {
      const lastIndex = current.entries.length - 1;
      current.entries[lastIndex] = `${current.entries[lastIndex]} ${rawLine.trim()}`;
    }
  }

  if (current) {
    releases.push(current);
  }

  return releases;
}

function toId(version: string) {
  const normalized = version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'release';
}

void main().catch((error) => {
  console.error('[build-changelog] Failed to generate changelog snapshot');
  console.error(error);
  process.exitCode = 1;
});
