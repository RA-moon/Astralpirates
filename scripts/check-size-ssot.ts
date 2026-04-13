import { promises as fs } from 'node:fs';
import path from 'node:path';

import { cssVariableTokens } from '../shared/theme/tokens';

type Classification = 'tokenize-directly' | 'derive-from-role' | 'requires-new-token' | 'allowed-exception';

type AllowlistCategory =
  | 'token-baseline'
  | 'demo-surface'
  | 'legacy-temp-allowed'
  | null;

type LedgerEntry = {
  filePath: string;
  line: number;
  column: number;
  literal: string;
  classification: Classification;
  target: string;
  reason: string;
  context: string;
  allowlistCategory: AllowlistCategory;
  localVarDefinition: boolean;
};

type Summary = {
  generatedAt: string;
  totals: {
    allLiterals: number;
    nonAllowlistedLiterals: number;
    localVarDefinitionsOutsideTokenBaselines: number;
  };
  byClassification: Record<Classification, number>;
  byAllowlistCategory: Record<string, number>;
  topFiles: Array<{ filePath: string; count: number }>;
  waveTargets: {
    waveA_priority_relations: number;
    waveB_shared_components_non_demo: number;
    waveC_pages_layouts_feature_styles: number;
    waveD_remaining_tail: number;
  };
};

type Report = {
  summary: Summary;
  entries: LedgerEntry[];
};

const REPO_ROOT = process.cwd();

const SCAN_ROOTS = [path.join(REPO_ROOT, 'frontend', 'app')];
const SCAN_EXTENSIONS = new Set(['.css', '.vue']);
const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.next', 'dist', '.git']);

const SIZE_LITERAL_RE = /\b\d*\.?\d+(?:px|rem|em|vh|vw|svh|dvh)\b/g;
const LOCAL_VAR_DEF_RE = /^\s*--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);?/;
const SIZE_LITERAL_WITH_UNIT_RE = /^(-?\d*\.?\d+)(px|rem|em|vh|vw|svh|dvh)$/u;
const UNITLESS_NUMBER_RE = /^-?\d*\.?\d+$/u;
const VAR_REFERENCE_RE = /^var\(--([a-z0-9_-]+)\)$/u;
const CALC_RE = /^calc\((.+)\)$/u;

const LEDGER_JSON_PATH = path.join(REPO_ROOT, 'docs', 'planning', 'ui-size-ssot-ledger.json');
const LEDGER_MD_PATH = path.join(REPO_ROOT, 'docs', 'planning', 'ui-size-ssot-ledger.md');

const pathCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const normalizePath = (filePath: string) => filePath.replace(/\\/g, '/');

const isTokenBaselineFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return normalized === 'frontend/app/styles/tokens.css' || normalized === 'frontend/app/styles/tokens.generated.css';
};

const isDemoSurfaceFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return (
    normalized === 'frontend/app/pages/dev/styleguide.vue' ||
    normalized.startsWith('frontend/app/components/ui/demo/')
  );
};

const isLegacyTempAllowedFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return normalized === 'frontend/app/app.vue';
};

const detectAllowlistCategory = (filePath: string): AllowlistCategory => {
  if (isTokenBaselineFile(filePath)) return 'token-baseline';
  if (isDemoSurfaceFile(filePath)) return 'demo-surface';
  if (isLegacyTempAllowedFile(filePath)) return 'legacy-temp-allowed';
  return null;
};

const normalizeSizeLiteral = (literal: string) => {
  const match = literal.match(SIZE_LITERAL_WITH_UNIT_RE);
  if (!match) return literal.trim().toLowerCase();
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return literal.trim().toLowerCase();
  const unit = match[2].toLowerCase();
  if (Number.isInteger(numeric)) return `${numeric}${unit}`;
  const normalizedNumeric = `${numeric}`.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
  return `${normalizedNumeric}${unit}`;
};

type ResolvedNumeric = {
  value: number;
  unit: string;
};

const roundNumeric = (value: number) => Number(value.toFixed(6));

const resolveExpressionNumeric = (
  expression: string,
  tokenValues: Record<string, string>,
  cache: Map<string, ResolvedNumeric | null>,
  stack: Set<string>,
): ResolvedNumeric | null => {
  const normalized = expression.trim().toLowerCase();
  const literalMatch = normalized.match(SIZE_LITERAL_WITH_UNIT_RE);
  if (literalMatch) {
    const value = Number(literalMatch[1]);
    if (!Number.isFinite(value)) return null;
    return { value, unit: literalMatch[2] };
  }

  if (UNITLESS_NUMBER_RE.test(normalized)) {
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return { value, unit: '' };
  }

  const variableMatch = normalized.match(VAR_REFERENCE_RE);
  if (variableMatch) {
    const tokenName = variableMatch[1];
    if (cache.has(tokenName)) return cache.get(tokenName) ?? null;
    if (stack.has(tokenName)) return null;
    const tokenValue = tokenValues[tokenName];
    if (typeof tokenValue !== 'string') return null;

    stack.add(tokenName);
    const resolved = resolveExpressionNumeric(tokenValue, tokenValues, cache, stack);
    stack.delete(tokenName);
    cache.set(tokenName, resolved);
    return resolved;
  }

  const calcMatch = normalized.match(CALC_RE);
  if (calcMatch) {
    const body = calcMatch[1];
    const factors = body
      .split('*')
      .map((part) => part.trim())
      .filter(Boolean);

    if (!factors.length) return null;

    let value = 1;
    let unit = '';

    for (const factor of factors) {
      const resolvedFactor = resolveExpressionNumeric(factor, tokenValues, cache, stack);
      if (!resolvedFactor) return null;

      if (unit && resolvedFactor.unit) {
        return null;
      }

      value *= resolvedFactor.value;
      if (!unit && resolvedFactor.unit) {
        unit = resolvedFactor.unit;
      }
    }

    if (!Number.isFinite(value)) return null;
    return {
      value: roundNumeric(value),
      unit,
    };
  }

  return null;
};

const buildLiteralToTokenMap = () => {
  const map = new Map<string, string[]>();
  const tokenValues = Object.fromEntries(
    Object.entries(cssVariableTokens)
      .filter(([, tokenValue]) => typeof tokenValue === 'string')
      .map(([tokenName, tokenValue]) => [tokenName, tokenValue.trim().toLowerCase()]),
  ) as Record<string, string>;

  const numericCache = new Map<string, ResolvedNumeric | null>();

  for (const [tokenName, tokenValue] of Object.entries(cssVariableTokens)) {
    if (typeof tokenValue !== 'string') continue;
    const resolved = resolveExpressionNumeric(tokenValue, tokenValues, numericCache, new Set<string>());
    if (!resolved || !resolved.unit) continue;
    const normalized = normalizeSizeLiteral(`${resolved.value}${resolved.unit}`);
    if (!SIZE_LITERAL_WITH_UNIT_RE.test(normalized)) continue;
    const existing = map.get(normalized) ?? [];
    existing.push(tokenName);
    map.set(normalized, existing);
  }

  for (const tokens of map.values()) {
    tokens.sort((a, b) => pathCollator.compare(a, b));
  }

  return map;
};

const literalToTokenMap = buildLiteralToTokenMap();

const isPriorityRelationFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return (
    normalized.includes('/styles/profile-page.css') ||
    normalized.endsWith('/components/CrewPortrait.vue') ||
    normalized.endsWith('/components/CrewIdentityCard.vue') ||
    normalized.endsWith('/components/CrewAvatarStack.vue') ||
    normalized.endsWith('/components/flight-plans/FlightPlanTasksPanel.vue') ||
    normalized.endsWith('/components/profile/HonorBadgeList.vue') ||
    normalized.endsWith('/styles/site-menu.css') ||
    normalized.endsWith('/background/plugins/menu-icon.ts')
  );
};

const isSharedComponentNonDemoFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return normalized.startsWith('frontend/app/components/') && !normalized.startsWith('frontend/app/components/ui/demo/');
};

const isPageLayoutOrFeatureStyleFile = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith('frontend/app/pages/') ||
    normalized.startsWith('frontend/app/layouts/') ||
    normalized.startsWith('frontend/app/styles/')
  );
};

const resolveRoleTarget = (filePath: string, literal: string, localVarDefinition: boolean) => {
  const normalizedPath = normalizePath(filePath);

  if (normalizedPath.endsWith('/components/CrewPortrait.vue') || normalizedPath.endsWith('/components/CrewIdentityCard.vue')) {
    return 'var(--size-avatar-hero) / role token alias';
  }

  if (
    normalizedPath.endsWith('/components/CrewAvatarStack.vue') ||
    normalizedPath.endsWith('/components/flight-plans/FlightPlanTasksPanel.vue')
  ) {
    return 'var(--size-avatar-sm) or var(--size-avatar-xs)';
  }

  if (normalizedPath.endsWith('/styles/profile-page.css') && (literal === '132px' || literal === '110px')) {
    return 'var(--size-avatar-hero) with responsive role mapping';
  }

  if (normalizedPath.endsWith('/styles/profile-page.css')) {
    return 'var(--size-badge-md) or related badge role token';
  }

  if (normalizedPath.endsWith('/styles/site-menu.css')) {
    return 'var(--size-menu-object) / menu relation token alias';
  }

  if (normalizedPath.endsWith('/layouts/default.vue') || normalizedPath.endsWith('/app.vue')) {
    return 'derive from scale-factor tokens via var(--icon-size-px) relation contract';
  }

  if (localVarDefinition) {
    return 'replace local numeric var with alias to shared token var(--...)';
  }

  return 'derive from size role token via central resolver';
};

const classifyEntry = (
  filePath: string,
  literal: string,
  localVarDefinition: boolean,
  allowlistCategory: AllowlistCategory,
): { classification: Classification; target: string; reason: string } => {
  if (allowlistCategory) {
    return {
      classification: 'allowed-exception',
      target: 'allowlisted source; keep until policy stage removes/changes allowlist',
      reason: allowlistCategory,
    };
  }

  const normalizedLiteral = normalizeSizeLiteral(literal.toLowerCase());
  const mappedTokens = literalToTokenMap.get(normalizedLiteral) ?? [];

  if (localVarDefinition) {
    return {
      classification: 'derive-from-role',
      target: resolveRoleTarget(filePath, literal, localVarDefinition),
      reason: 'local size variable should alias central token/resolver output',
    };
  }

  if (mappedTokens.length > 0) {
    return {
      classification: 'tokenize-directly',
      target: `var(--${mappedTokens[0]})`,
      reason: `literal matches existing token value (${mappedTokens.join(', ')})`,
    };
  }

  if (isPriorityRelationFile(filePath) || /avatar|badge|menu|site-menu|crew/i.test(filePath)) {
    return {
      classification: 'derive-from-role',
      target: resolveRoleTarget(filePath, literal, localVarDefinition),
      reason: 'priority relation surface should use role/relation token derivation',
    };
  }

  return {
    classification: 'requires-new-token',
    target: 'define token in shared/theme/tokens.ts then consume via var(--token-name)',
    reason: 'no direct token mapping found',
  };
};

async function collectFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }

  return files;
}

async function scanLedgerEntries(): Promise<LedgerEntry[]> {
  const allFiles = (
    await Promise.all(
      SCAN_ROOTS.map(async (scanRoot) => {
        try {
          return await collectFiles(scanRoot);
        } catch {
          return [] as string[];
        }
      }),
    )
  ).flat();

  const entries: LedgerEntry[] = [];

  for (const absolutePath of allFiles) {
    const relativePath = normalizePath(path.relative(REPO_ROOT, absolutePath));
    const allowlistCategory = detectAllowlistCategory(relativePath);

    const raw = await fs.readFile(absolutePath, 'utf8');
    const lines = raw.split(/\r?\n/);

    lines.forEach((lineContent, index) => {
      const line = index + 1;
      const trimmed = lineContent.trim();
      const localVarMatch = lineContent.match(LOCAL_VAR_DEF_RE);
      const isLocalVarDefinition = Boolean(localVarMatch);

      SIZE_LITERAL_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = SIZE_LITERAL_RE.exec(lineContent))) {
        const literal = match[0];
        const column = match.index + 1;

        const { classification, target, reason } = classifyEntry(
          relativePath,
          literal,
          isLocalVarDefinition,
          allowlistCategory,
        );

        entries.push({
          filePath: relativePath,
          line,
          column,
          literal,
          classification,
          target,
          reason,
          context: trimmed,
          allowlistCategory,
          localVarDefinition: isLocalVarDefinition,
        });
      }
    });
  }

  entries.sort((a, b) => {
    if (a.filePath !== b.filePath) return pathCollator.compare(a.filePath, b.filePath);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  return entries;
}

function buildSummary(entries: LedgerEntry[]): Summary {
  const byClassification: Record<Classification, number> = {
    'tokenize-directly': 0,
    'derive-from-role': 0,
    'requires-new-token': 0,
    'allowed-exception': 0,
  };

  const byAllowlistCategory = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  let nonAllowlistedLiterals = 0;
  let localVarDefinitionsOutsideTokenBaselines = 0;

  let waveA = 0;
  let waveB = 0;
  let waveC = 0;
  let waveD = 0;

  for (const entry of entries) {
    byClassification[entry.classification] += 1;
    fileCounts.set(entry.filePath, (fileCounts.get(entry.filePath) ?? 0) + 1);

    if (entry.allowlistCategory) {
      byAllowlistCategory.set(entry.allowlistCategory, (byAllowlistCategory.get(entry.allowlistCategory) ?? 0) + 1);
    }

    if (!entry.allowlistCategory) {
      nonAllowlistedLiterals += 1;

      if (entry.localVarDefinition && !isTokenBaselineFile(entry.filePath)) {
        localVarDefinitionsOutsideTokenBaselines += 1;
      }

      if (isPriorityRelationFile(entry.filePath)) {
        waveA += 1;
      } else if (isSharedComponentNonDemoFile(entry.filePath)) {
        waveB += 1;
      } else if (isPageLayoutOrFeatureStyleFile(entry.filePath)) {
        waveC += 1;
      } else {
        waveD += 1;
      }
    }
  }

  const topFiles = [...fileCounts.entries()]
    .map(([filePath, count]) => ({ filePath, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return pathCollator.compare(a.filePath, b.filePath);
    })
    .slice(0, 25);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      allLiterals: entries.length,
      nonAllowlistedLiterals,
      localVarDefinitionsOutsideTokenBaselines,
    },
    byClassification,
    byAllowlistCategory: Object.fromEntries([...byAllowlistCategory.entries()].sort((a, b) => pathCollator.compare(a[0], b[0]))),
    topFiles,
    waveTargets: {
      waveA_priority_relations: waveA,
      waveB_shared_components_non_demo: waveB,
      waveC_pages_layouts_feature_styles: waveC,
      waveD_remaining_tail: waveD,
    },
  };
}

function buildMarkdownLedger(report: Report) {
  const lines: string[] = [];
  const { summary, entries } = report;

  lines.push('# UI Size SSOT Ledger');
  lines.push('');
  lines.push(`Generated: \`${summary.generatedAt}\``);
  lines.push('');
  lines.push('## Baseline Counts');
  lines.push('');
  lines.push(`- All size literals detected: **${summary.totals.allLiterals}**`);
  lines.push(`- Non-allowlisted literals: **${summary.totals.nonAllowlistedLiterals}**`);
  lines.push(
    `- Local var definitions outside token baselines: **${summary.totals.localVarDefinitionsOutsideTokenBaselines}**`,
  );
  lines.push('');
  lines.push('## Classification Totals');
  lines.push('');
  lines.push(`- \`tokenize-directly\`: **${summary.byClassification['tokenize-directly']}**`);
  lines.push(`- \`derive-from-role\`: **${summary.byClassification['derive-from-role']}**`);
  lines.push(`- \`requires-new-token\`: **${summary.byClassification['requires-new-token']}**`);
  lines.push(`- \`allowed-exception\`: **${summary.byClassification['allowed-exception']}**`);
  lines.push('');
  lines.push('## Wave Targets (Non-allowlisted)');
  lines.push('');
  lines.push(`- Wave A (priority relation surfaces): **${summary.waveTargets.waveA_priority_relations}**`);
  lines.push(`- Wave B (shared components, non-demo): **${summary.waveTargets.waveB_shared_components_non_demo}**`);
  lines.push(`- Wave C (pages/layouts/feature styles): **${summary.waveTargets.waveC_pages_layouts_feature_styles}**`);
  lines.push(`- Wave D (tail): **${summary.waveTargets.waveD_remaining_tail}**`);
  lines.push('');
  lines.push('## Top Files');
  lines.push('');
  lines.push('| File | Count |');
  lines.push('| --- | ---: |');
  for (const row of summary.topFiles) {
    lines.push(`| \`${row.filePath}\` | ${row.count} |`);
  }
  lines.push('');
  lines.push('## Full Ledger (JSON)');
  lines.push('');
  lines.push('- [ui-size-ssot-ledger.json](docs/planning/ui-size-ssot-ledger.json)');
  lines.push('');
  lines.push('## Sample Entries (First 120)');
  lines.push('');
  lines.push('| File | Line | Literal | Classification | Target |');
  lines.push('| --- | ---: | --- | --- | --- |');

  for (const entry of entries.slice(0, 120)) {
    lines.push(
      `| \`${entry.filePath}\` | ${entry.line} | \`${entry.literal}\` | \`${entry.classification}\` | ${entry.target.replace(/\|/g, '\\|')} |`,
    );
  }

  lines.push('');
  lines.push('_Use the JSON ledger for the complete per-line migration backlog._');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function printReport(summary: Summary) {
  console.log(`generatedAt: ${summary.generatedAt}`);
  console.log(`allLiterals: ${summary.totals.allLiterals}`);
  console.log(`nonAllowlistedLiterals: ${summary.totals.nonAllowlistedLiterals}`);
  console.log(`localVarDefinitionsOutsideTokenBaselines: ${summary.totals.localVarDefinitionsOutsideTokenBaselines}`);
  console.log(`classifications: ${JSON.stringify(summary.byClassification)}`);
  console.log(`waveTargets: ${JSON.stringify(summary.waveTargets)}`);
}

async function run() {
  const args = new Set(process.argv.slice(2));
  const writeLedger = args.has('--write-ledger');
  const assertClean = args.has('--assert-clean');
  const assertNoRegression = args.has('--assert-no-regression');

  const entries = await scanLedgerEntries();
  const summary = buildSummary(entries);
  const report: Report = { summary, entries };

  printReport(summary);

  if (writeLedger) {
    await fs.writeFile(LEDGER_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(LEDGER_MD_PATH, buildMarkdownLedger(report), 'utf8');
    console.log(`wrote: ${normalizePath(path.relative(REPO_ROOT, LEDGER_JSON_PATH))}`);
    console.log(`wrote: ${normalizePath(path.relative(REPO_ROOT, LEDGER_MD_PATH))}`);
  }

  if (assertNoRegression) {
    let baselineRaw: string;
    try {
      baselineRaw = await fs.readFile(LEDGER_JSON_PATH, 'utf8');
    } catch (error) {
      console.error(
        `[size-ssot] Cannot assert regression baseline: ${normalizePath(path.relative(REPO_ROOT, LEDGER_JSON_PATH))} is missing.`,
      );
      process.exitCode = 1;
      return;
    }

    let baselineSummary: Summary | null = null;
    try {
      const parsed = JSON.parse(baselineRaw) as Partial<Report>;
      baselineSummary = parsed?.summary ?? null;
    } catch {
      baselineSummary = null;
    }

    if (!baselineSummary) {
      console.error('[size-ssot] Cannot parse regression baseline summary from ui-size-ssot-ledger.json.');
      process.exitCode = 1;
      return;
    }

    const comparisons = [
      {
        key: 'nonAllowlistedLiterals',
        current: summary.totals.nonAllowlistedLiterals,
        baseline: baselineSummary.totals.nonAllowlistedLiterals,
      },
      {
        key: 'localVarDefinitionsOutsideTokenBaselines',
        current: summary.totals.localVarDefinitionsOutsideTokenBaselines,
        baseline: baselineSummary.totals.localVarDefinitionsOutsideTokenBaselines,
      },
      {
        key: 'waveA_priority_relations',
        current: summary.waveTargets.waveA_priority_relations,
        baseline: baselineSummary.waveTargets.waveA_priority_relations,
      },
      {
        key: 'waveB_shared_components_non_demo',
        current: summary.waveTargets.waveB_shared_components_non_demo,
        baseline: baselineSummary.waveTargets.waveB_shared_components_non_demo,
      },
      {
        key: 'waveC_pages_layouts_feature_styles',
        current: summary.waveTargets.waveC_pages_layouts_feature_styles,
        baseline: baselineSummary.waveTargets.waveC_pages_layouts_feature_styles,
      },
      {
        key: 'waveD_remaining_tail',
        current: summary.waveTargets.waveD_remaining_tail,
        baseline: baselineSummary.waveTargets.waveD_remaining_tail,
      },
    ];

    const regressions = comparisons.filter((comparison) => comparison.current > comparison.baseline);
    if (regressions.length > 0) {
      console.error('[size-ssot] Regression detected against committed ledger baseline:');
      for (const regression of regressions) {
        console.error(
          `  - ${regression.key}: current=${regression.current}, baseline=${regression.baseline}`,
        );
      }
      process.exitCode = 1;
      return;
    }
  }

  if (assertClean && summary.totals.nonAllowlistedLiterals > 0) {
    console.error('[size-ssot] Non-allowlisted size literals remain.');
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[size-ssot] Failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
