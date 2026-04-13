import sanitizeHtml from 'sanitize-html';

export const sanitizeCrewHtml = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = sanitizeHtml(trimmed, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text: string) => text.replace(/\r?\n/g, '\n'),
  }).trim();
  return cleaned.length > 0 ? cleaned : null;
};
