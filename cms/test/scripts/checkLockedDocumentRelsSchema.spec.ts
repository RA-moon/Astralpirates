import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractRequiredLockedRelsColumns } from '@/src/scripts/ci/checkLockedDocumentRelsSchema.ts';

describe('extractRequiredLockedRelsColumns', () => {
  it('extracts locked-doc relation columns from payload-generated schema', async () => {
    const schemaPath = path.resolve(process.cwd(), 'src/payload-generated-schema.ts');
    const schemaSource = await fs.readFile(schemaPath, 'utf8');

    const columns = extractRequiredLockedRelsColumns(schemaSource);

    expect(columns).toContain('flight_plan_series_id');
    expect(columns).toContain('flight_plan_status_events_id');
    expect(columns).toContain('users_id');
    expect(columns.every((columnName) => columnName.endsWith('_id'))).toBe(true);
  });

  it('fails when locked-doc table block is missing', () => {
    expect(() => extractRequiredLockedRelsColumns('export const users = pgTable("users", {});')).toThrow(
      /Could not locate payload_locked_documents_rels table definition/,
    );
  });
});
