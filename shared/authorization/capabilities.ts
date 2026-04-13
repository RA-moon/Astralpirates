export const AUTHORIZATION_CAPABILITIES = [
  'readPage',
  'editPage',
  'manageLogs',
  'createFlightPlans',
  'readFlightPlan',
  'editFlightPlan',
  'manageFlightPlanLifecycle',
  'deleteFlightPlan',
  'downloadMedia',
  'manageMissionMedia',
  'manageAvatar',
  'manageHonorBadgeMedia',
  'adminReadAllContent',
  'adminEditAllContent',
] as const;

export type AuthorizationCapability = (typeof AUTHORIZATION_CAPABILITIES)[number];
