#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const VALID_PREFIXES = ['docs/', 'cms/', 'frontend/', 'shared/', 'scripts/', 'docker/', 'config/', '.github/'];
const VALID_FILES = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json']);
const ROADMAP_TIER_VALUES = new Set(['tier1', 'tier2', 'tier3', 'tier4', 'tier5']);
const ROADMAP_STATUS_VALUES = new Set(['queued', 'active', 'shipped', 'tested', 'canceled']);
const ROADMAP_CLOUD_STATUS_VALUES = new Set(['pending', 'deploying', 'healthy']);
const MAX_EXCEPTION_TTL_DAYS = 30;
const MAX_EXCEPTION_TTL_MS = MAX_EXCEPTION_TTL_DAYS * 24 * 60 * 60 * 1000;
const ISO_8601_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCanonicalTierPlanDocPath(value) {
  return isNonEmptyString(value) && value.startsWith('docs/planning/') && value.endsWith('.md');
}

function parseIsoUtcTimestampMs(value) {
  if (!isNonEmptyString(value)) return null;
  if (!ISO_8601_UTC_TIMESTAMP_RE.test(value)) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function validateTimedExceptionSchema({ item, itemPath, errors, base, currentMs }) {
  const intentionalField = `${base}Intentional`;
  const reasonField = `${base}Reason`;
  const ownerField = `${base}Owner`;
  const createdAtField = `${base}CreatedAt`;
  const expiresAtField = `${base}ExpiresAt`;
  const ticketField = `${base}Ticket`;

  const intentional = item[intentionalField];
  const reason = item[reasonField];
  const owner = item[ownerField];
  const createdAt = item[createdAtField];
  const expiresAt = item[expiresAtField];
  const ticket = item[ticketField];
  const hasReason = reason !== undefined;
  const hasOwner = owner !== undefined;
  const hasCreatedAt = createdAt !== undefined;
  const hasExpiresAt = expiresAt !== undefined;
  const hasTicket = ticket !== undefined;
  const createdAtMs = parseIsoUtcTimestampMs(createdAt);
  const expiresAtMs = parseIsoUtcTimestampMs(expiresAt);

  if (intentional !== undefined && typeof intentional !== 'boolean') {
    errors.push(`${itemPath}.${intentionalField} must be a boolean when provided.`);
  }
  if (hasReason && !isNonEmptyString(reason)) {
    errors.push(`${itemPath}.${reasonField} must be a non-empty string when provided.`);
  }
  if (intentional === true && !hasReason) {
    errors.push(`${itemPath}.${reasonField} is required when ${intentionalField} is true.`);
  }
  if (intentional !== true && hasReason) {
    errors.push(`${itemPath}.${reasonField} is only allowed when ${intentionalField} is true.`);
  }

  if (hasOwner && !isNonEmptyString(owner)) {
    errors.push(`${itemPath}.${ownerField} must be a non-empty string when provided.`);
  }
  if (intentional !== true && hasOwner) {
    errors.push(`${itemPath}.${ownerField} is only allowed when ${intentionalField} is true.`);
  }

  if (hasCreatedAt && createdAtMs === null) {
    errors.push(
      `${itemPath}.${createdAtField} must be a valid ISO 8601 UTC date-time string when provided (example: 2026-04-01T00:00:00Z).`,
    );
  }
  if (intentional !== true && hasCreatedAt) {
    errors.push(`${itemPath}.${createdAtField} is only allowed when ${intentionalField} is true.`);
  }

  if (hasExpiresAt && expiresAtMs === null) {
    errors.push(
      `${itemPath}.${expiresAtField} must be a valid ISO 8601 UTC date-time string when provided (example: 2026-04-01T00:00:00Z).`,
    );
  }
  if (intentional !== true && hasExpiresAt) {
    errors.push(`${itemPath}.${expiresAtField} is only allowed when ${intentionalField} is true.`);
  }
  if (hasTicket && !isHttpsUrl(ticket)) {
    errors.push(`${itemPath}.${ticketField} must be an absolute https URL when provided.`);
  }
  if (intentional !== true && hasTicket) {
    errors.push(`${itemPath}.${ticketField} is only allowed when ${intentionalField} is true.`);
  }

  if (intentional === true) {
    if (!hasOwner) {
      errors.push(`${itemPath}.${ownerField} is required when ${intentionalField} is true.`);
    }
    if (!hasCreatedAt) {
      errors.push(`${itemPath}.${createdAtField} is required when ${intentionalField} is true.`);
    }
    if (!hasExpiresAt) {
      errors.push(`${itemPath}.${expiresAtField} is required when ${intentionalField} is true.`);
    }
    if (!hasTicket) {
      errors.push(`${itemPath}.${ticketField} is required when ${intentionalField} is true.`);
    }
    if (createdAtMs !== null && createdAtMs > currentMs) {
      errors.push(`${itemPath}.${createdAtField} must not be in the future.`);
    }
    if (createdAtMs !== null && expiresAtMs !== null && createdAtMs > expiresAtMs) {
      errors.push(`${itemPath}.${createdAtField} must be earlier than or equal to ${expiresAtField}.`);
    }
    if (
      createdAtMs !== null &&
      expiresAtMs !== null &&
      expiresAtMs - createdAtMs > MAX_EXCEPTION_TTL_MS
    ) {
      errors.push(
        `${itemPath}.${expiresAtField} exceeds maximum exception window of ${MAX_EXCEPTION_TTL_DAYS} days from ${createdAtField}.`,
      );
    }
    if (expiresAtMs !== null && expiresAtMs <= currentMs) {
      errors.push(`${itemPath}.${expiresAtField} is expired. Extend or remove the exception marker.`);
    }
  }
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeDocPath(value) {
  return value.replace(/^\.\//, '').replace(/\\/g, '/');
}

function isDocsMarkdownPath(value) {
  return isNonEmptyString(value) && value.startsWith('docs/') && value.endsWith('.md');
}

function referenceUrlResolvesToPlanPath(referenceUrl, expectedPlanPath) {
  if (!isNonEmptyString(referenceUrl) || !isNonEmptyString(expectedPlanPath)) return false;
  try {
    const normalizedExpected = normalizeDocPath(expectedPlanPath).replace(/^\/+/, '');
    const url = new URL(referenceUrl);
    const normalizedPathname = normalizeDocPath(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    return (
      normalizedPathname === normalizedExpected ||
      normalizedPathname.endsWith(`/${normalizedExpected}`)
    );
  } catch {
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return markdown;
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) return markdown;
  return markdown.slice(end + 5);
}

function extractInlineCode(markdown) {
  const out = [];
  const re = /`([^`\n]+)`/g;
  let match = re.exec(markdown);
  while (match) {
    out.push(match[1]);
    match = re.exec(markdown);
  }
  return out;
}

function extractMarkdownLinks(markdown) {
  const out = [];
  const re = /\[[^\]]*]\(([^)]+)\)/g;
  let match = re.exec(markdown);
  while (match) {
    out.push(match[1]);
    match = re.exec(markdown);
  }
  return out;
}

function stripTokenDecorators(token) {
  let normalized = token.trim();
  normalized = normalized.replace(/^["'(<`]+/, '');
  normalized = normalized.replace(/[>"')`.,;:]+$/, '');
  return normalized;
}

function looksLikePathToken(token) {
  if (!token) return false;
  if (/^https?:\/\//i.test(token)) return false;
  if (VALID_FILES.has(token)) return true;
  return VALID_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function normalizePathToken(token) {
  let normalized = stripTokenDecorators(token);
  if (!normalized) return null;
  if (!looksLikePathToken(normalized)) return null;
  if (normalized.includes('*') || normalized.includes('...') || normalized.includes('<release>')) return null;

  // Strip line annotations like :42 or :42-51 and fragment markers.
  normalized = normalized.replace(/#L\d+(?:C\d+)?$/i, '');
  normalized = normalized.replace(/:\d+(?:-\d+)?$/, '');
  normalized = normalized.replace(/[?.].*$/, (suffix) => (suffix.startsWith('.') ? suffix : ''));
  return normalized;
}

function tokenizeCandidate(candidate) {
  const parts = candidate.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [candidate];
  return parts;
}

function collectDeterministicRefs(markdownBody) {
  const candidates = [...extractInlineCode(markdownBody), ...extractMarkdownLinks(markdownBody)];
  const refs = new Set();
  const nonDeterministic = new Set();

  for (const candidate of candidates) {
    for (const token of tokenizeCandidate(candidate)) {
      const cleaned = stripTokenDecorators(token);
      if (!cleaned) continue;
      if (!looksLikePathToken(cleaned)) continue;
      if (cleaned.includes('*') || cleaned.includes('...') || cleaned.includes('<release>')) {
        nonDeterministic.add(cleaned);
        continue;
      }
      const normalized = normalizePathToken(cleaned);
      if (normalized) refs.add(normalized);
    }
  }

  return {
    refs: [...refs],
    nonDeterministic: [...nonDeterministic],
  };
}

function resolvePlanDocPath(planRecord, roadmapItem) {
  return planRecord?.path ?? roadmapItem?.plan?.path ?? null;
}

function parseArgs(argv) {
  const options = {
    json: false,
    assertClean: false,
    root: process.cwd(),
    nowMs: Date.now(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--assert-clean') {
      options.assertClean = true;
      continue;
    }
    if (arg === '--root') {
      const maybeRoot = argv[index + 1];
      if (!maybeRoot) {
        throw new Error('Expected a value after --root');
      }
      options.root = path.resolve(maybeRoot);
      index += 1;
      continue;
    }
    if (arg === '--now') {
      const maybeNow = argv[index + 1];
      if (!maybeNow) {
        throw new Error('Expected a value after --now');
      }
      const parsedNow = Date.parse(maybeNow);
      if (Number.isNaN(parsedNow)) {
        throw new Error(`Invalid value for --now: ${maybeNow}`);
      }
      options.nowMs = parsedNow;
      index += 1;
      continue;
    }
  }

  return options;
}

function resolveInputPaths(root) {
  return {
    roadmapPath: path.join(root, 'cms/seed/data/roadmap.json'),
    plansPath: path.join(root, 'cms/seed/data/plans.json'),
  };
}

function normalizePlanRecordsExport(planExport) {
  if (Array.isArray(planExport)) return planExport;
  if (isRecord(planExport) && Array.isArray(planExport.plans)) return planExport.plans;
  return null;
}

function validateRoadmapSchema(roadmap, currentMs) {
  const errors = [];
  const seenRoadmapItemIds = new Set();
  const seenPlanIdUsages = new Map();
  if (!isRecord(roadmap)) {
    errors.push('roadmap must be a JSON object.');
    return errors;
  }

  if (!Array.isArray(roadmap.tiers)) {
    errors.push('roadmap.tiers must be an array.');
    return errors;
  }

  roadmap.tiers.forEach((tier, tierIndex) => {
    const tierPath = `roadmap.tiers[${tierIndex}]`;
    if (!isRecord(tier)) {
      errors.push(`${tierPath} must be an object.`);
      return;
    }

    if (!isNonEmptyString(tier.id)) {
      errors.push(`${tierPath}.id must be a non-empty string.`);
    }
    if (!Array.isArray(tier.items)) {
      errors.push(`${tierPath}.items must be an array.`);
      return;
    }

    tier.items.forEach((item, itemIndex) => {
      const itemPath = `${tierPath}.items[${itemIndex}]`;
      if (!isRecord(item)) {
        errors.push(`${itemPath} must be an object.`);
        return;
      }
      const isTier12Item = tier.id === 'tier1' || tier.id === 'tier2';

      if (!isNonEmptyString(item.id)) {
        errors.push(`${itemPath}.id must be a non-empty string.`);
      } else {
        if (seenRoadmapItemIds.has(item.id)) {
          errors.push(`${itemPath}.id duplicates a previous roadmap item id: ${item.id}.`);
        }
        seenRoadmapItemIds.add(item.id);
      }
      if (!isNonEmptyString(item.planId)) {
        errors.push(`${itemPath}.planId must be a non-empty string.`);
      } else {
        const aliasIntentional = item.planIdAliasIntentional;
        const aliasReason = item.planIdAliasReason;
        if (aliasIntentional !== undefined && typeof aliasIntentional !== 'boolean') {
          errors.push(`${itemPath}.planIdAliasIntentional must be a boolean when provided.`);
        }
        if (aliasReason !== undefined && !isNonEmptyString(aliasReason)) {
          errors.push(`${itemPath}.planIdAliasReason must be a non-empty string when provided.`);
        }
        if (aliasIntentional === true && !isNonEmptyString(aliasReason)) {
          errors.push(`${itemPath}.planIdAliasReason is required when planIdAliasIntentional is true.`);
        }
        if (aliasIntentional !== true && aliasReason !== undefined) {
          errors.push(
            `${itemPath}.planIdAliasReason is only allowed when planIdAliasIntentional is true.`,
          );
        }
        const usages = seenPlanIdUsages.get(item.planId) ?? [];
        usages.push({
          itemPath,
          aliasIntentional: aliasIntentional === true,
        });
        seenPlanIdUsages.set(item.planId, usages);
      }
      validateTimedExceptionSchema({
        item,
        itemPath,
        errors,
        base: 'planPathCanonicalException',
        currentMs,
      });
      validateTimedExceptionSchema({
        item,
        itemPath,
        errors,
        base: 'planMetaParityException',
        currentMs,
      });
      validateTimedExceptionSchema({
        item,
        itemPath,
        errors,
        base: 'planReferenceParityException',
        currentMs,
      });
      if (!isNonEmptyString(item.status)) {
        errors.push(`${itemPath}.status must be a non-empty string.`);
      } else if (!ROADMAP_STATUS_VALUES.has(item.status)) {
        errors.push(
          `${itemPath}.status (${item.status}) must be one of: ${[...ROADMAP_STATUS_VALUES].join(', ')}.`,
        );
      }
      if (isTier12Item && !isNonEmptyString(item.tier)) {
        errors.push(`${itemPath}.tier must be a non-empty string for tier1/tier2 items.`);
      } else if (isTier12Item && item.tier !== tier.id) {
        errors.push(`${itemPath}.tier (${item.tier}) must match containing tier id (${tier.id}).`);
      }
      if (isTier12Item && !isNonEmptyString(item.cloudStatus)) {
        errors.push(`${itemPath}.cloudStatus must be a non-empty string for tier1/tier2 items.`);
      } else if (isTier12Item && !ROADMAP_CLOUD_STATUS_VALUES.has(item.cloudStatus)) {
        errors.push(
          `${itemPath}.cloudStatus (${item.cloudStatus}) must be one of: ${[...ROADMAP_CLOUD_STATUS_VALUES].join(', ')}.`,
        );
      }
      if (isTier12Item && !isNonEmptyString(item.referenceLabel)) {
        errors.push(`${itemPath}.referenceLabel must be a non-empty string for tier1/tier2 items.`);
      }
      if (isTier12Item && !isNonEmptyString(item.referenceUrl)) {
        errors.push(`${itemPath}.referenceUrl must be a non-empty string for tier1/tier2 items.`);
      } else if (isTier12Item && !isHttpUrl(item.referenceUrl)) {
        errors.push(`${itemPath}.referenceUrl must be an absolute http(s) URL for tier1/tier2 items.`);
      }
      if (item.plan !== undefined) {
        if (!isRecord(item.plan)) {
          errors.push(`${itemPath}.plan must be an object when provided.`);
        } else if (item.plan.path !== undefined && !isNonEmptyString(item.plan.path)) {
          errors.push(`${itemPath}.plan.path must be a non-empty string when provided.`);
        }
      }
    });
  });

  for (const [planId, usages] of seenPlanIdUsages.entries()) {
    if (usages.length <= 1) continue;
    const unmarkedUsages = usages.filter((usage) => !usage.aliasIntentional);
    if (unmarkedUsages.length > 0) {
      for (const usage of unmarkedUsages) {
        errors.push(
          `${usage.itemPath}.planId duplicates a previous roadmap planId: ${planId}. Set planIdAliasIntentional=true with planIdAliasReason when aliasing is intentional.`,
        );
      }
    }
  }

  return errors;
}

function validatePlansSchema(planExport, planRecords) {
  const errors = [];
  if (!Array.isArray(planRecords)) {
    errors.push('plans export must be an array or an object with a `plans` array.');
    return errors;
  }

  const seenPlanIds = new Set();
  const seenPlanPaths = new Set();
  planRecords.forEach((plan, index) => {
    const planPath = `plans[${index}]`;
    if (!isRecord(plan)) {
      errors.push(`${planPath} must be an object.`);
      return;
    }

    if (!isNonEmptyString(plan.id)) {
      errors.push(`${planPath}.id must be a non-empty string.`);
    } else {
      if (seenPlanIds.has(plan.id)) {
        errors.push(`${planPath}.id duplicates a previous plan id: ${plan.id}.`);
      }
      seenPlanIds.add(plan.id);
    }

    if (!isNonEmptyString(plan.path)) {
      errors.push(`${planPath}.path must be a non-empty string.`);
    } else {
      if (!isDocsMarkdownPath(plan.path)) {
        errors.push(`${planPath}.path (${plan.path}) must be a docs markdown path (docs/**/*.md).`);
      }
      if (seenPlanPaths.has(plan.path)) {
        errors.push(`${planPath}.path duplicates a previous plan path: ${plan.path}.`);
      }
      seenPlanPaths.add(plan.path);
    }
    if (!isNonEmptyString(plan.tier)) {
      errors.push(`${planPath}.tier must be a non-empty string.`);
    } else if (!ROADMAP_TIER_VALUES.has(plan.tier)) {
      errors.push(
        `${planPath}.tier (${plan.tier}) must be one of: ${[...ROADMAP_TIER_VALUES].join(', ')}.`,
      );
    }
    if (!isNonEmptyString(plan.status)) {
      errors.push(`${planPath}.status must be a non-empty string.`);
    } else if (!ROADMAP_STATUS_VALUES.has(plan.status)) {
      errors.push(
        `${planPath}.status (${plan.status}) must be one of: ${[...ROADMAP_STATUS_VALUES].join(', ')}.`,
      );
    }
    if (!isNonEmptyString(plan.cloudStatus)) {
      errors.push(`${planPath}.cloudStatus must be a non-empty string.`);
    } else if (!ROADMAP_CLOUD_STATUS_VALUES.has(plan.cloudStatus)) {
      errors.push(
        `${planPath}.cloudStatus (${plan.cloudStatus}) must be one of: ${[...ROADMAP_CLOUD_STATUS_VALUES].join(', ')}.`,
      );
    }
  });

  return errors;
}

function validateRoadmapPlansCrossSchema(roadmap, planRecords) {
  const errors = [];
  if (!isRecord(roadmap) || !Array.isArray(roadmap.tiers) || !Array.isArray(planRecords)) {
    return errors;
  }

  const planById = new Map();
  for (const plan of planRecords) {
    if (!isRecord(plan)) continue;
    if (!isNonEmptyString(plan.id) || !isNonEmptyString(plan.path)) continue;
    planById.set(plan.id, plan);
  }

  roadmap.tiers.forEach((tier, tierIndex) => {
    if (!isRecord(tier) || !Array.isArray(tier.items)) return;
    if (tier.id !== 'tier1' && tier.id !== 'tier2') return;

    tier.items.forEach((item, itemIndex) => {
      if (!isRecord(item) || !isNonEmptyString(item.planId)) return;
      const itemPath = `roadmap.tiers[${tierIndex}].items[${itemIndex}]`;
      const planRecord = planById.get(item.planId);
      if (!planRecord) {
        errors.push(`${itemPath}.planId does not exist in plans export: ${item.planId}.`);
        return;
      }
      const planPath = planRecord.path;

      if (isRecord(item.plan) && item.plan.path !== undefined && isNonEmptyString(item.plan.path) && item.plan.path !== planPath) {
        errors.push(
          `${itemPath}.plan.path (${item.plan.path}) does not match plans export path (${planPath}) for planId ${item.planId}.`,
        );
      }

      const pathExceptionIntentional = item.planPathCanonicalExceptionIntentional === true;
      if (!isCanonicalTierPlanDocPath(planPath)) {
        if (!pathExceptionIntentional) {
          errors.push(
            `${itemPath}.planId (${item.planId}) resolves to non-canonical plan path (${planPath}). Set planPathCanonicalExceptionIntentional=true with planPathCanonicalExceptionReason when this is intentional.`,
          );
        }
      } else if (pathExceptionIntentional) {
        errors.push(
          `${itemPath}.planPathCanonicalExceptionIntentional must be omitted because plan path is canonical: ${planPath}.`,
        );
      }

      const metaParityMismatches = [];
      for (const field of ['tier', 'status', 'cloudStatus']) {
        if (!isNonEmptyString(item[field]) || !isNonEmptyString(planRecord[field])) continue;
        if (item[field] !== planRecord[field]) {
          metaParityMismatches.push({
            field,
            itemValue: item[field],
            planValue: planRecord[field],
          });
        }
      }

      const metaParityExceptionIntentional = item.planMetaParityExceptionIntentional === true;
      if (metaParityMismatches.length > 0) {
        if (!metaParityExceptionIntentional) {
          for (const mismatch of metaParityMismatches) {
            errors.push(
              `${itemPath}.${mismatch.field} (${mismatch.itemValue}) does not match plans export ${mismatch.field} (${mismatch.planValue}) for planId ${item.planId}. Set planMetaParityExceptionIntentional=true with planMetaParityExceptionReason when this is intentional.`,
            );
          }
        }
      } else if (metaParityExceptionIntentional) {
        errors.push(
          `${itemPath}.planMetaParityExceptionIntentional must be omitted because tier/status/cloudStatus already match plans export for planId ${item.planId}.`,
        );
      }

      const referenceParityMismatches = [];
      const normalizedPlanPath = normalizeDocPath(planPath);
      const normalizedReferenceLabel = isNonEmptyString(item.referenceLabel)
        ? normalizeDocPath(item.referenceLabel)
        : null;

      if (!normalizedReferenceLabel) {
        referenceParityMismatches.push(
          `${itemPath}.referenceLabel must be a non-empty string matching plans export path (${planPath}) for planId ${item.planId}.`,
        );
      } else if (normalizedReferenceLabel !== normalizedPlanPath) {
        referenceParityMismatches.push(
          `${itemPath}.referenceLabel (${item.referenceLabel}) does not match plans export path (${planPath}) for planId ${item.planId}.`,
        );
      }

      if (!isNonEmptyString(item.referenceUrl)) {
        referenceParityMismatches.push(
          `${itemPath}.referenceUrl must be a non-empty URL resolving to plans export path (${planPath}) for planId ${item.planId}.`,
        );
      } else if (!referenceUrlResolvesToPlanPath(item.referenceUrl, planPath)) {
        referenceParityMismatches.push(
          `${itemPath}.referenceUrl (${item.referenceUrl}) does not resolve to plans export path (${planPath}) for planId ${item.planId}.`,
        );
      }

      const referenceParityExceptionIntentional = item.planReferenceParityExceptionIntentional === true;
      if (referenceParityMismatches.length > 0) {
        if (!referenceParityExceptionIntentional) {
          for (const mismatch of referenceParityMismatches) {
            errors.push(
              `${mismatch} Set planReferenceParityExceptionIntentional=true with planReferenceParityExceptionReason when this is intentional.`,
            );
          }
        }
      } else if (referenceParityExceptionIntentional) {
        errors.push(
          `${itemPath}.planReferenceParityExceptionIntentional must be omitted because referenceLabel/referenceUrl already align to plans export path for planId ${item.planId}.`,
        );
      }
    });
  });

  return errors;
}

function createBaseReport(generatedAt, schemaErrors = []) {
  return {
    generatedAt,
    items: 0,
    missingRefs: 0,
    noRunLogRefs: 0,
    noRefs: 0,
    nonDeterministicRefs: 0,
    unresolvedPlanDocs: 0,
    schemaErrors: schemaErrors.length,
    details: {
      missingRefPlans: [],
      noRunLogPlans: [],
      noRefPlans: [],
      nonDeterministicPlans: [],
      unresolvedPlanDocs: [],
      schemaErrors,
    },
  };
}

function printReport(report) {
  console.log(`generatedAt: ${report.generatedAt}`);
  console.log(`items: ${report.items}`);
  console.log(`missingRefs: ${report.missingRefs}`);
  console.log(`noRunLogRefs: ${report.noRunLogRefs}`);
  console.log(`noRefs: ${report.noRefs}`);
  console.log(`nonDeterministicRefs: ${report.nonDeterministicRefs}`);
  console.log(`unresolvedPlanDocs: ${report.unresolvedPlanDocs}`);
  console.log(`schemaErrors: ${report.schemaErrors}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { roadmapPath, plansPath } = resolveInputPaths(args.root);
  const roadmap = readJson(roadmapPath);
  const planExport = readJson(plansPath);
  const planRecords = normalizePlanRecordsExport(planExport);

  const schemaErrors = [
    ...validateRoadmapSchema(roadmap, args.nowMs),
    ...validatePlansSchema(planExport, planRecords),
  ];
  if (schemaErrors.length === 0) {
    schemaErrors.push(...validateRoadmapPlansCrossSchema(roadmap, planRecords));
  }

  if (schemaErrors.length > 0) {
    const report = createBaseReport(new Date().toISOString(), schemaErrors);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    printReport(report);

    if (args.assertClean) {
      console.error('[tier1-tier2-governance] Blocking issues detected.');
      console.error('[tier1-tier2-governance] Schema validation errors detected.');
      report.details.schemaErrors.forEach((error) => {
        console.error(`[tier1-tier2-governance] Schema error: ${error}`);
      });
      process.exitCode = 1;
    }
    return;
  }

  const byPlanId = new Map(planRecords.map((plan) => [plan.id, plan]));

  const items = [];
  for (const tier of roadmap.tiers ?? []) {
    if (tier.id !== 'tier1' && tier.id !== 'tier2') continue;
    for (const item of tier.items ?? []) {
      items.push(item);
    }
  }

  let missingRefs = 0;
  let noRunLogRefs = 0;
  let noRefs = 0;
  let nonDeterministicRefs = 0;
  const missingRefPlans = [];
  const noRunLogPlans = [];
  const noRefPlans = [];
  const nonDeterministicPlans = [];
  const unresolvedPlanDocs = [];

  for (const item of items) {
    const planRecord = byPlanId.get(item.planId);
    const docPath = resolvePlanDocPath(planRecord, item);
    if (!docPath || !fs.existsSync(path.join(args.root, docPath))) {
      unresolvedPlanDocs.push({
        itemId: item.id,
        planId: item.planId,
        docPath: docPath ?? '(missing)',
      });
      continue;
    }

    const raw = fs.readFileSync(path.join(args.root, docPath), 'utf8');
    const body = stripFrontmatter(raw);
    const { refs, nonDeterministic } = collectDeterministicRefs(body);
    nonDeterministicRefs += nonDeterministic.length;
    if (nonDeterministic.length > 0) {
      nonDeterministicPlans.push({
        itemId: item.id,
        planId: item.planId,
        docPath,
        refs: nonDeterministic,
      });
    }

    if (refs.length === 0) {
      noRefs += 1;
      noRefPlans.push({ itemId: item.id, planId: item.planId, docPath });
    }

    if (item.status === 'shipped') {
      const hasRunLogRef = refs.some((ref) => ref.startsWith('docs/run-logs/'));
      if (!hasRunLogRef) {
        noRunLogRefs += 1;
        noRunLogPlans.push({ itemId: item.id, planId: item.planId, docPath });
      }
    }

    let planMissing = 0;
    const missingRefsForPlan = [];
    for (const ref of refs) {
      if (!fs.existsSync(path.join(args.root, ref))) {
        missingRefs += 1;
        planMissing += 1;
        missingRefsForPlan.push(ref);
      }
    }
    if (planMissing > 0) {
      missingRefPlans.push({
        itemId: item.id,
        planId: item.planId,
        docPath,
        missing: planMissing,
        refs: missingRefsForPlan,
      });
    }
  }

  const report = createBaseReport(new Date().toISOString());
  report.items = items.length;
  report.missingRefs = missingRefs;
  report.noRunLogRefs = noRunLogRefs;
  report.noRefs = noRefs;
  report.nonDeterministicRefs = nonDeterministicRefs;
  report.unresolvedPlanDocs = unresolvedPlanDocs.length;
  report.details.missingRefPlans = missingRefPlans;
  report.details.noRunLogPlans = noRunLogPlans;
  report.details.noRefPlans = noRefPlans;
  report.details.nonDeterministicPlans = nonDeterministicPlans;
  report.details.unresolvedPlanDocs = unresolvedPlanDocs;

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report);

  if (args.assertClean) {
    const hasBlockingIssues =
      report.missingRefs > 0 ||
      report.noRunLogRefs > 0 ||
      report.noRefs > 0 ||
      report.nonDeterministicRefs > 0 ||
      report.unresolvedPlanDocs > 0 ||
      report.schemaErrors > 0;

    if (hasBlockingIssues) {
      console.error('[tier1-tier2-governance] Blocking issues detected.');
      if (report.details.missingRefPlans.length > 0) {
        console.error(
          `[tier1-tier2-governance] Missing refs in plans: ${report.details.missingRefPlans
            .map((entry) => `${entry.itemId}(${entry.missing})`)
            .join(', ')}`,
        );
      }
      if (report.details.noRunLogPlans.length > 0) {
        console.error(
          `[tier1-tier2-governance] Shipped plans without run-log refs: ${report.details.noRunLogPlans
            .map((entry) => entry.itemId)
            .join(', ')}`,
        );
      }
      if (report.details.noRefPlans.length > 0) {
        console.error(
          `[tier1-tier2-governance] Plans without deterministic refs: ${report.details.noRefPlans
            .map((entry) => entry.itemId)
            .join(', ')}`,
        );
      }
      if (report.details.nonDeterministicPlans.length > 0) {
        console.error(
          `[tier1-tier2-governance] Plans with non-deterministic refs: ${report.details.nonDeterministicPlans
            .map((entry) => `${entry.itemId}(${entry.refs.length})`)
            .join(', ')}`,
        );
      }
      if (report.details.unresolvedPlanDocs.length > 0) {
        console.error(
          `[tier1-tier2-governance] Unresolved plan docs: ${report.details.unresolvedPlanDocs
            .map((entry) => `${entry.itemId}:${entry.docPath}`)
            .join(', ')}`,
        );
      }
      if (report.details.schemaErrors.length > 0) {
        console.error('[tier1-tier2-governance] Schema validation errors detected.');
        report.details.schemaErrors.forEach((error) => {
          console.error(`[tier1-tier2-governance] Schema error: ${error}`);
        });
      }
      process.exitCode = 1;
    }
  }
}

main();
