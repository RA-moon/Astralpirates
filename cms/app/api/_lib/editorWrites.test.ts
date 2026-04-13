import { describe, expect, it } from 'vitest';

import {
  buildEditorDocumentEtag,
  hashEditorLogToken,
  hashEditorMutationPayload,
  normaliseEditorDocumentType,
  normaliseEditorLockMode,
  parseEditorDocumentEtag,
  resolveEditorIdempotencyCleanupBatchSize,
  resolveEditorIdempotencyCleanupMaxBatches,
  resolveEditorIdempotencyRetentionDays,
  resolveEditorBaseRevision,
  sanitiseEditorIdempotencyKey,
  sanitiseEditorSessionId,
} from './editorWrites';

describe('editorWrites helpers', () => {
  it('normalizes document type and lock mode', () => {
    expect(normaliseEditorDocumentType('flight-plan')).toBe('flight-plan');
    expect(normaliseEditorDocumentType(' page ')).toBe('page');
    expect(normaliseEditorDocumentType('unknown')).toBeNull();

    expect(normaliseEditorLockMode('soft')).toBe('soft');
    expect(normaliseEditorLockMode(' HARD ')).toBe('hard');
    expect(normaliseEditorLockMode('invalid')).toBeNull();
  });

  it('sanitizes idempotency and session values', () => {
    expect(sanitiseEditorSessionId('   session-123   ')).toBe('session-123');
    expect(sanitiseEditorSessionId('')).toBeNull();

    expect(sanitiseEditorIdempotencyKey(' key-1 ')).toBe('key-1');
    expect(sanitiseEditorIdempotencyKey('')).toBeNull();
  });

  it('builds and parses editor etag format', () => {
    const etag = buildEditorDocumentEtag({
      documentType: 'flight-plan',
      documentId: 42,
      revision: 7,
    });

    expect(etag).toBe('W/"doc:flight-plan:42:7"');
    expect(parseEditorDocumentEtag(etag)).toEqual({
      documentType: 'flight-plan',
      documentId: 42,
      revision: 7,
    });
    expect(parseEditorDocumentEtag('"doc:page:18:4"')).toEqual({
      documentType: 'page',
      documentId: 18,
      revision: 4,
    });
    expect(parseEditorDocumentEtag('W/"invalid"')).toBeNull();
  });

  it('resolves base revision from explicit value or If-Match etag', () => {
    expect(
      resolveEditorBaseRevision({
        baseRevision: 9,
        ifMatch: 'W/"doc:flight-plan:42:8"',
        documentType: 'flight-plan',
        documentId: 42,
      }),
    ).toBe(9);

    expect(
      resolveEditorBaseRevision({
        ifMatch: 'W/"doc:flight-plan:42:8"',
        documentType: 'flight-plan',
        documentId: 42,
      }),
    ).toBe(8);

    expect(
      resolveEditorBaseRevision({
        ifMatch: 'W/"doc:page:42:8"',
        documentType: 'flight-plan',
        documentId: 42,
      }),
    ).toBeNull();
  });

  it('hashes mutation payload deterministically', () => {
    const a = hashEditorMutationPayload({ foo: 'bar', count: 1 });
    const b = hashEditorMutationPayload({ foo: 'bar', count: 1 });
    const c = hashEditorMutationPayload({ foo: 'bar', count: 2 });

    expect(a).toHaveLength(64);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('hashes editor log tokens with fixed short length', () => {
    const a = hashEditorLogToken(' editor-key-1 ');
    const b = hashEditorLogToken('editor-key-1');
    const c = hashEditorLogToken('editor-key-2');

    expect(a).toHaveLength(16);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(hashEditorLogToken('')).toBeNull();
  });

  it('resolves idempotency cleanup defaults and clamps values', () => {
    expect(resolveEditorIdempotencyRetentionDays(undefined)).toBe(14);
    expect(resolveEditorIdempotencyRetentionDays(0)).toBe(14);
    expect(resolveEditorIdempotencyRetentionDays(1_000)).toBe(180);

    expect(resolveEditorIdempotencyCleanupBatchSize(undefined)).toBe(500);
    expect(resolveEditorIdempotencyCleanupBatchSize(0)).toBe(500);
    expect(resolveEditorIdempotencyCleanupBatchSize(99_999)).toBe(5000);

    expect(resolveEditorIdempotencyCleanupMaxBatches(undefined)).toBe(40);
    expect(resolveEditorIdempotencyCleanupMaxBatches(0)).toBe(40);
    expect(resolveEditorIdempotencyCleanupMaxBatches(9999)).toBe(500);
  });
});
