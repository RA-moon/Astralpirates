#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const logsPath = path.join(ROOT, 'cms', 'seed', 'data', 'logs.json');

const isBlank = (value) => !value || String(value).trim().length === 0;
const isPlaceholder = (value) => String(value).trim().toLowerCase() === 'test';

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

try {
  const raw = fs.readFileSync(logsPath, 'utf8');
  const data = JSON.parse(raw);
  const invalid = [];

  if (Array.isArray(data)) {
    data.forEach((log, index) => {
      const headline = log?.headline ?? log?.title ?? '';
      if (isBlank(headline) || isPlaceholder(headline)) {
        invalid.push({ index, headline });
      }
    });
  }

  if (invalid.length > 0) {
    fail(
      `Found ${invalid.length} seed log(s) with missing/placeholder headlines: ` +
        invalid
          .slice(0, 5)
          .map((item) => `#${item.index} \"${item.headline ?? ''}\"`)
          .join(', ') +
        (invalid.length > 5 ? '...' : ''),
    );
  }
} catch (error) {
  fail(`Failed to lint seed log headlines: ${error instanceof Error ? error.message : String(error)}`);
}
