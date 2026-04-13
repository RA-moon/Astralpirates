#!/usr/bin/env node

/**
 * Fails CI if the CMS is using unsupported framework versions.
 * This protects the Payload admin bundle from breaking changes in
 * Next/React or unvetted Payload bumps.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(projectRoot, 'cms', 'package.json');

const REQUIRED = {
  dependencies: {
    payload: '3.78.0',
    '@payloadcms/next': '3.78.0',
    '@payloadcms/db-postgres': '3.78.0',
    '@payloadcms/drizzle': '3.78.0',
    '@payloadcms/richtext-lexical': '3.78.0',
    next: '15.5.10',
    react: '19.2.0',
    'react-dom': '19.2.0',
  },
  devDependencies: {
    '@next/eslint-plugin-next': '15.5.10',
    'eslint-config-next': '16.1.6',
    '@types/react': '19.2.7',
    '@types/react-dom': '19.2.3',
  },
};

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const checkSection = (sectionName, requiredEntries) => {
  const deps = pkg[sectionName] || {};
  Object.entries(requiredEntries).forEach(([name, expected]) => {
    const actual = deps[name];
    if (!actual) {
      fail(`cms/package.json is missing ${sectionName}["${name}"] (expected ${expected}).`);
    }
    if (actual !== expected) {
      fail(
        `cms/package.json ${sectionName}["${name}"] is ${actual}; expected ${expected}. ` +
          'Bumping these without a compatibility review is blocked.',
      );
    }
    if (/^[~^]/.test(actual)) {
      fail(
        `cms/package.json ${sectionName}["${name}"] uses a range (${actual}). ` +
          'Pin exact versions to avoid implicit upgrades.',
      );
    }
  });
};

checkSection('dependencies', REQUIRED.dependencies);
checkSection('devDependencies', REQUIRED.devDependencies);

console.log('✓ CMS stack versions are pinned to the supported set.');
