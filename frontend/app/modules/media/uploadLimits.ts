export const parsePositiveIntFromEnv = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const formatMegabyteLabel = (bytes: number): string => {
  const value = bytes / (1024 * 1024);
  return Number.isInteger(value) ? `${value}MB` : `${value.toFixed(1).replace(/\.0$/, '')}MB`;
};
