export const ROADMAP_TIER_OPTIONS = [
  { label: 'Tier 1', value: 'tier1' },
  { label: 'Tier 2', value: 'tier2' },
  { label: 'Tier 3', value: 'tier3' },
  { label: 'Tier 4', value: 'tier4' },
  { label: 'Tier 5', value: 'tier5' },
];

export const PLAN_TIER_OPTIONS = [
  ...ROADMAP_TIER_OPTIONS,
  { label: 'Platform', value: 'platform' },
  { label: 'Support/Reference', value: 'support' },
  { label: 'Meta', value: 'meta' },
];

export const PLAN_STATUS_OPTIONS = [
  { label: 'Queued', value: 'queued' },
  { label: 'In flight', value: 'active' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Tested (archived)', value: 'tested' },
  { label: 'Canceled (archived)', value: 'canceled' },
];

export const PLAN_CLOUD_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Deploying', value: 'deploying' },
  { label: 'Healthy', value: 'healthy' },
];

export const trimTextValue = (value: unknown): string =>
  (typeof value === 'string' ? value.trim() : '');

export const nullableTextValue = (value: unknown): string | undefined => {
  const trimmed = trimTextValue(value);
  return trimmed.length > 0 ? trimmed : undefined;
};
