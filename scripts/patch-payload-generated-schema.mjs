#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const schemaPath = path.join(repoRoot, 'cms', 'src', 'payload-generated-schema.ts');

const TS_NOCHECK = '// @ts-nocheck';

const fail = (message) => {
  console.error(`[patch-payload-generated-schema] ${message}`);
  process.exit(1);
};

let source = '';
try {
  source = readFileSync(schemaPath, 'utf8');
} catch (error) {
  fail(`Unable to read schema file at ${schemaPath}: ${error?.message || String(error)}`);
}

if (source.includes(TS_NOCHECK)) {
  process.exit(0);
}

const lines = source.split(/\r?\n/);
const eslintIndex = lines.findIndex((line) => line.trim() === '/* eslint-disable */');

if (eslintIndex >= 0) {
  lines.splice(eslintIndex + 1, 0, TS_NOCHECK);
} else {
  lines.unshift(TS_NOCHECK);
}

const next = `${lines.join('\n').replace(/\n+$/g, '\n')}`;
if (next === source) {
  process.exit(0);
}

try {
  writeFileSync(schemaPath, next, 'utf8');
} catch (error) {
  fail(`Unable to write schema file at ${schemaPath}: ${error?.message || String(error)}`);
}

