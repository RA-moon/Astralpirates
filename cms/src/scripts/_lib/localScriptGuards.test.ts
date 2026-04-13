import { describe, expect, it } from 'vitest';

import { envFlagEnabled, isLocalHost } from './localScriptGuards';

describe('localScriptGuards', () => {
  it('parses boolean env-style flags', () => {
    expect(envFlagEnabled('1')).toBe(true);
    expect(envFlagEnabled('true')).toBe(true);
    expect(envFlagEnabled('yes')).toBe(true);
    expect(envFlagEnabled('on')).toBe(true);
    expect(envFlagEnabled('off')).toBe(false);
    expect(envFlagEnabled(undefined)).toBe(false);
  });

  it('detects local hosts', () => {
    expect(isLocalHost('http://localhost:3000')).toBe(true);
    expect(isLocalHost('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalHost('https://cms.local')).toBe(true);
    expect(isLocalHost('https://astralpirates.com')).toBe(false);
  });
});

