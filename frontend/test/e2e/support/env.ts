import fs from 'node:fs';
import path from 'node:path';

type EnvSource = {
  path: string;
  found: boolean;
};

const parseLine = (line: string): [string, string] | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) return null;
  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  const value = rawValue.replace(/^['"]|['"]$/g, '');
  if (!key) return null;
  return [key, value];
};

const applyEnvFile = (filePath: string): EnvSource => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    content
      .split(/\r?\n/)
      .map(parseLine)
      .filter((entry): entry is [string, string] => Boolean(entry))
      .forEach(([key, value]) => {
        if (typeof process.env[key] === 'undefined') {
          process.env[key] = value;
        }
      });
    return { path: filePath, found: true };
  } catch {
    return { path: filePath, found: false };
  }
};

export const loadPlaywrightEnv = (): EnvSource | null => {
  const candidates = [
    process.env.PLAYWRIGHT_ENV_PATH,
    process.env.PLAYWRIGHT_ENV_FILE,
    path.resolve(process.cwd(), '.env.playwright.local'),
    path.resolve(process.cwd(), '.env.playwright'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const result = applyEnvFile(candidate);
    if (result.found) return result;
  }

  return null;
};
