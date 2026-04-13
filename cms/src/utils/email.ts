const MAX_EMAIL_LENGTH = 320;

const containsAsciiWhitespaceOrControl = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 32) {
      return true;
    }
  }
  return false;
};

const hasEmptyDomainLabel = (domain: string): boolean => {
  let labelLength = 0;
  for (let index = 0; index < domain.length; index += 1) {
    if (domain.charCodeAt(index) === 46) {
      if (labelLength === 0) return true;
      labelLength = 0;
      continue;
    }
    labelLength += 1;
  }
  return labelLength === 0;
};

export const sanitizeEmailInput = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > MAX_EMAIL_LENGTH) return null;
  if (containsAsciiWhitespaceOrControl(normalized)) return null;

  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf('@')) return null;

  const domain = normalized.slice(atIndex + 1);
  if (domain.length < 3 || !domain.includes('.')) return null;
  if (domain.startsWith('.') || domain.endsWith('.')) return null;
  if (hasEmptyDomainLabel(domain)) return null;

  return normalized;
};
