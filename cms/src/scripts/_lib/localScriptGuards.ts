export const envFlagEnabled = (value?: string | null): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value ?? '').toString().trim().toLowerCase());

export const isLocalHost = (url?: string | null): boolean => {
  if (!url) return true;
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  } catch {
    return false;
  }
};

