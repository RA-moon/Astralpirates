export const HONOR_BADGE_CODE_VALUES = ['pioneer'] as const;

export type HonorBadgeCode = (typeof HONOR_BADGE_CODE_VALUES)[number];

export type HonorBadgeSource = 'automatic' | 'manual';

export type HonorBadgeRarity = 'event' | 'seasonal' | 'permanent';

export type HonorBadgeEligibilityRule =
  | {
      type: 'enlistmentYear';
      year: number;
      description?: string;
    };

export type HonorBadgeMediaDescriptor = {
  uploadCollection: 'honor-badge-media';
  badgeCode: HonorBadgeCode;
};

export type HonorBadgeDefinition = {
  code: HonorBadgeCode;
  label: string;
  description: string;
  tooltip?: string;
  iconPath: string;
  media?: HonorBadgeMediaDescriptor;
  rarity?: HonorBadgeRarity;
  eligibility?: HonorBadgeEligibilityRule[];
  unlockHint?: string;
};

export type HonorBadgeRecord = {
  code: HonorBadgeCode;
  awardedAt: string;
  source: HonorBadgeSource;
  note?: string | null;
};

export const HONOR_BADGE_DEFINITIONS: Record<HonorBadgeCode, HonorBadgeDefinition> = {
  pioneer: {
    code: 'pioneer',
    label: 'Pioneer',
    description: 'Awarded to the crew who enlisted with Astral Pirates during the 2025 charter.',
    tooltip: 'Pioneer',
    iconPath: '/images/badges/pioneer.svg',
    media: {
      uploadCollection: 'honor-badge-media',
      badgeCode: 'pioneer',
    },
    rarity: 'event',
    eligibility: [
      {
        type: 'enlistmentYear',
        year: 2025,
        description: 'Automatically granted to crew accounts created in 2025.',
      },
    ],
    unlockHint: 'Enlist with the crew during 2025 to commemorate the founding flight.',
  },
};

export const HONOR_BADGE_CODES = [...HONOR_BADGE_CODE_VALUES] as HonorBadgeCode[];

export const HONOR_BADGE_CODE_SET = new Set<HonorBadgeCode>(HONOR_BADGE_CODES);

export const listHonorBadgeDefinitions = (): HonorBadgeDefinition[] =>
  Object.values(HONOR_BADGE_DEFINITIONS);

export const resolveHonorBadgeDefinition = (
  code: unknown,
): HonorBadgeDefinition | null => {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toLowerCase() as HonorBadgeCode;
  if (!HONOR_BADGE_CODE_SET.has(trimmed)) return null;
  return HONOR_BADGE_DEFINITIONS[trimmed];
};
