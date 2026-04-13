const sanitiseNote = (note: string | null | undefined): string | null => {
  if (!note) return null;
  const trimmed = note.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.replace(/"/g, "'");
};

export const formatLogTitle = (options: { stamp: string; callSign: string; note?: string | null }): string => {
  const parts = [`Log ${options.stamp}`];
  const safeNote = sanitiseNote(options.note);
  if (safeNote) {
    parts.push(`– ${safeNote}`);
  }
  return parts.join(' ');
};

export const parseLogTitle = (
  title: string | null | undefined,
): { stamp: string | null; note: string | null; callSign: string | null } => {
  if (!title) {
    return { stamp: null, note: null, callSign: null };
  }
  const trimmed = title.trim();
  const modernMatch = trimmed.match(/^Log\s+(\d{8,14})(?:\s+–\s+(.+))?$/);
  if (modernMatch) {
    return {
      stamp: modernMatch[1].padEnd(14, '0').slice(0, 14),
      note: modernMatch[2]?.trim() ?? null,
      callSign: null,
    };
  }
  const legacyMatch = trimmed.match(/^Log\s+(\d{8,14})(?:\s+"([^"]+)")?\s+(.+)$/);
  if (legacyMatch) {
    return {
      stamp: legacyMatch[1].padEnd(14, '0').slice(0, 14),
      note: legacyMatch[2] ?? null,
      callSign: legacyMatch[3].trim(),
    };
  }

  // Legacy format fallback e.g. navigator-log <stamp>
  const digitsMatch = trimmed.match(/(\d{8,14})/);
  return {
    stamp: digitsMatch ? digitsMatch[1].padEnd(14, '0').slice(0, 14) : null,
    note: null,
    callSign: null,
  };
};
