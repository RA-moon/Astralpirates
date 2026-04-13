import type { Payload } from 'payload';

import { isLocalHost } from './localScriptGuards';

type PayloadFindOnly = Pick<Payload, 'find'>;

export { isLocalHost };

export const slugifyTestValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'test';

export const buildLexicalDoc = (text: string) => ({
  root: {
    type: 'root' as const,
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph' as const,
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [
          {
            type: 'text' as const,
            text,
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal' as const,
            style: '' as const,
          },
        ],
      },
    ],
  },
});

export const findUserByEmail = async (instance: PayloadFindOnly, email: string) => {
  const result = await instance.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
};
