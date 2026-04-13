import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isDirectExecution } from './directExecution';

describe('isDirectExecution', () => {
  it('returns true when argv points to the same module path', () => {
    const executedPath = path.resolve('/tmp', 'script.ts');
    const moduleUrl = pathToFileURL(executedPath).href;

    expect(isDirectExecution(moduleUrl, ['node', executedPath])).toBe(true);
  });

  it('returns false when argv does not match module URL', () => {
    const moduleUrl = pathToFileURL(path.resolve('/tmp', 'script.ts')).href;

    expect(isDirectExecution(moduleUrl, ['node', '/tmp/other.ts'])).toBe(false);
  });
});
