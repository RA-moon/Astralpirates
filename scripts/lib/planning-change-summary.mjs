import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_LOG_MAX_BUFFER = 1024 * 1024;
const PLANNING_PATHS = ['docs/planning', 'docs/run-logs'];

const WINDOW_LABEL_DEFAULT = 'selected window';

const normalizeIso = (value) => {
  const parsed = Date.parse(String(value ?? '').trim());
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
};

const pluralize = (count, singular, plural = `${singular}s`) => (count === 1 ? singular : plural);

export const collectPlanningCommitSummary = async ({ startIso, endIso, maxEntries = 4 }) => {
  const normalizedStart = normalizeIso(startIso);
  const normalizedEnd = normalizeIso(endIso);
  if (!normalizedStart || !normalizedEnd) {
    return {
      available: false,
      reason: 'invalid-window',
      count: 0,
      entries: [],
      hiddenCount: 0,
    };
  }

  if (Date.parse(normalizedStart) >= Date.parse(normalizedEnd)) {
    return {
      available: false,
      reason: 'empty-window',
      count: 0,
      entries: [],
      hiddenCount: 0,
    };
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        '--no-merges',
        `--since=${normalizedStart}`,
        `--until=${normalizedEnd}`,
        '--date=short',
        '--pretty=format:%h|%ad|%s',
        '--',
        ...PLANNING_PATHS,
      ],
      { maxBuffer: GIT_LOG_MAX_BUFFER },
    );

    const rows = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha = '', date = '', ...subjectParts] = line.split('|');
        return {
          sha: sha.trim(),
          date: date.trim(),
          subject: subjectParts.join('|').trim(),
        };
      })
      .filter((entry) => entry.sha && entry.subject);

    const safeMaxEntries = Math.max(1, Math.trunc(Number(maxEntries) || 0));
    const visibleEntries = rows.slice(0, safeMaxEntries);
    const hiddenCount = Math.max(0, rows.length - visibleEntries.length);

    return {
      available: true,
      reason: '',
      count: rows.length,
      entries: visibleEntries,
      hiddenCount,
    };
  } catch (error) {
    return {
      available: false,
      reason: 'git-unavailable',
      count: 0,
      entries: [],
      hiddenCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const toPlanningSummaryLines = ({ summary, windowLabel = WINDOW_LABEL_DEFAULT }) => {
  const label = windowLabel || WINDOW_LABEL_DEFAULT;
  if (!summary?.available) {
    return [`Planning updates: unavailable (${summary?.reason || 'unknown'})`];
  }
  if (summary.count === 0) {
    return [`Planning updates: none (${label})`];
  }

  const lines = [
    `Planning updates: ${summary.count} ${pluralize(summary.count, 'commit')} (${label})`,
    ...summary.entries.map((entry) => `- ${entry.sha} ${entry.date} ${entry.subject}`),
  ];

  if (summary.hiddenCount > 0) {
    lines.push(`- ...and ${summary.hiddenCount} more`);
  }

  return lines;
};
