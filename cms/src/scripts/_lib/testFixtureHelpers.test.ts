import { describe, expect, it } from 'vitest';

import { buildLexicalDoc, isLocalHost, slugifyTestValue } from './testFixtureHelpers';

describe('testFixtureHelpers', () => {
  it('detects localhost-style hosts', () => {
    expect(isLocalHost('http://localhost:3000')).toBe(true);
    expect(isLocalHost('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalHost('http://cms.local')).toBe(true);
    expect(isLocalHost('https://astralpirates.com')).toBe(false);
  });

  it('slugifies test values with fallback', () => {
    expect(slugifyTestValue(' Test CASE 01 ')).toBe('test-case-01');
    expect(slugifyTestValue('###')).toBe('test');
  });

  it('builds a lexical paragraph document', () => {
    expect(buildLexicalDoc('hello')).toEqual({
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [
          {
            type: 'paragraph',
            format: '',
            indent: 0,
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'text',
                text: 'hello',
                version: 1,
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
              },
            ],
          },
        ],
      },
    });
  });
});
