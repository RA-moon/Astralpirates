#!/usr/bin/env node

/**
 * Track OpenAI token usage for a billing window and warn when crossing thresholds.
 *
 * Example:
 *   OPENAI_API_KEY=sk-... node scripts/tools/track-openai-usage.js --quota 500000
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      config[key] = true;
      continue;
    }
    config[key] = next;
    i += 1;
  }

  return config;
};

const ensureNumber = (value, label) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return numeric;
};

const parseThresholds = (value) => {
  if (!value) return DEFAULT_THRESHOLDS;
  return value
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((numeric) => Number.isFinite(numeric) && numeric > 0)
    .sort((a, b) => a - b);
};

const firstDayOfMonth = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const toIsoDate = (date) => {
  return date.toISOString().slice(0, 10);
};

const readState = (statePath) => {
  if (!statePath) return null;
  try {
    const data = fs.readFileSync(statePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

const writeState = (statePath, state) => {
  if (!statePath) return;
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
};

const fetchUsage = async ({ apiKey, startDate, endDate }) => {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const res = await fetch(`https://api.openai.com/v1/usage?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Usage request failed (${res.status}): ${text}`);
  }

  return res.json();
};

const sumTokens = (usage) => {
  if (!usage?.data) return 0;
  return usage.data.reduce((total, entry) => {
    const context = Number(entry.n_context_tokens_total) || 0;
    const generated = Number(entry.n_generated_tokens_total) || 0;
    return total + context + generated;
  }, 0);
};

(async () => {
  try {
    const args = parseArgs();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY env var is required");
    }

    const quota = ensureNumber(args.quota || args.limit, "--quota");
    const notify = parseThresholds(args.notify);
    const statePath = args.state ? path.resolve(args.state) : path.resolve(".openai-usage-state.json");

    const startDate = args.start
      ? args.start
      : toIsoDate(firstDayOfMonth());
    const endDate = args.end ? args.end : toIsoDate(new Date());

    const usage = await fetchUsage({ apiKey, startDate, endDate });
    const totalTokens = sumTokens(usage);
    const percentUsed = Math.min(100, (totalTokens / quota) * 100);

    const priorState = readState(statePath) || {};
    const lastNotified = Number(priorState.lastNotifiedPercent) || 0;

    const reached = notify.filter((threshold) => threshold <= percentUsed);
    const highestReached = reached.length > 0 ? reached[reached.length - 1] : null;

    console.log(`Total tokens: ${totalTokens.toLocaleString()} between ${startDate} and ${endDate}`);
    console.log(`Quota: ${quota.toLocaleString()} tokens`);
    console.log(`Usage: ${percentUsed.toFixed(2)}%`);

    if (highestReached && highestReached > lastNotified) {
      console.log(`⚠️  Token usage crossed ${highestReached}% of the configured quota.`);
    }

    const state = {
      updatedAt: new Date().toISOString(),
      startDate,
      endDate,
      totalTokens,
      percentUsed,
      lastNotifiedPercent: highestReached || lastNotified,
    };
    writeState(statePath, state);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
})();
