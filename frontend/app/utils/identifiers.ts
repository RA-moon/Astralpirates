/**
 * Normalises an identifier coming from different sources (numbers, strings, Payload docs, etc.)
 * into a trimmed string value. Returns null when the identifier cannot be resolved.
 */
export const normalizeIdentifier = (value: unknown): string | null => {
  if (value == null) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('id' in record) {
      return normalizeIdentifier(record.id);
    }
    const valueOf = (record as { valueOf?: () => unknown }).valueOf;
    if (typeof valueOf === 'function') {
      try {
        const resolved = valueOf.call(record);
        if (resolved !== value) {
          return normalizeIdentifier(resolved);
        }
      } catch {
        // Swallow valueOf errors and continue.
      }
    }
  }

  return null;
};
