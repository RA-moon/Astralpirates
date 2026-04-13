export const envFlagEnabled = (value) =>
  ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());

export const isLocalHost = (value) => {
  if (!value) return true;
  try {
    const { hostname } = new URL(value);
    const host = hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  } catch {
    return false;
  }
};
