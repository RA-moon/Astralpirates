import { z } from 'zod';
import { HONOR_BADGE_CODE_VALUES } from './honorBadges';
import { sanitizePageBlocks, sanitizeNavigationOverrides } from './pageBlocks';
import { FLIGHT_PLAN_TASK_STATES } from './taskStates';
import { AVATAR_MEDIA_TYPES } from './avatarMedia';
import {
  FLIGHT_PLAN_LIFECYCLE_BUCKETS,
  FLIGHT_PLAN_LIFECYCLE_STATUSES,
  FLIGHT_PLAN_STATUS_EVENT_ACTION_TYPES,
} from './flightPlanLifecycle';
import {
  ACCESS_POLICY_MODES,
  ACCESS_ROLE_SPACES,
  FLIGHT_PLAN_ACCESS_ROLES,
  normalizeAccessPolicy,
  type AccessPolicy,
} from './accessPolicy';

const NullableString = z.string().nullable().optional();
export const NullableNumber = z.number().nullable().optional();
export type NullableNumberSchema = typeof NullableNumber;
export const AvatarMediaTypeSchema = z.enum(AVATAR_MEDIA_TYPES);
const NullableAvatarMediaType = AvatarMediaTypeSchema.nullable().optional();

const RelationshipIdentifierSchema = z.union([
  z.number(),
  z.string(),
  z.object({
    id: z.union([z.number(), z.string()]),
  }),
]);

export const AccessPolicyModeSchema = z.enum(ACCESS_POLICY_MODES);

export const AccessRoleSpaceSchema = z.enum(ACCESS_ROLE_SPACES);

export const FlightPlanAccessRoleSchema = z.enum(FLIGHT_PLAN_ACCESS_ROLES);

const AccessPolicyRawSchema = z.object({
  mode: AccessPolicyModeSchema,
  roleSpace: AccessRoleSpaceSchema.optional(),
  minimumRole: z.string().optional(),
  minimumCrewRole: z.string().optional(),
  minimumFlightPlanRole: z.string().optional(),
});

export const AccessPolicySchema: z.ZodType<AccessPolicy> = z.preprocess(
  (value) => normalizeAccessPolicy(value as any),
  AccessPolicyRawSchema.transform((value) => value as AccessPolicy),
);

export const NullableAccessPolicySchema = z.preprocess(
  (value) => {
    if (value == null) return null;
    return normalizeAccessPolicy(value as any);
  },
  AccessPolicyRawSchema.nullable().transform((value) => (value ? (value as AccessPolicy) : null)),
);

const HonorBadgeSourceSchema = z.enum(['automatic', 'manual']);

export const HonorBadgeSchema = z.object({
  code: z.enum(HONOR_BADGE_CODE_VALUES),
  label: z.string(),
  description: z.string(),
  tooltip: NullableString,
  iconUrl: z.string(),
  iconMediaUrl: NullableString.optional(),
  iconMimeType: NullableString.optional(),
  iconFilename: NullableString.optional(),
  rarity: NullableString,
  awardedAt: z.string(),
  source: HonorBadgeSourceSchema,
  note: NullableString,
});

export type HonorBadge = z.infer<typeof HonorBadgeSchema>;

export const PageEditorRulesSchema = z.object({
  minRole: z.string().nullable().optional(),
  allowedRoles: z.array(z.string()).nullable().optional(),
  allowedUsers: z.array(RelationshipIdentifierSchema).nullable().optional(),
});

export const CrewSummarySchema = z.object({
  id: z.number(),
  profileSlug: z.string(),
  displayName: z.string(),
  callSign: NullableString,
  role: NullableString,
  avatarUrl: NullableString,
  avatarMediaType: NullableAvatarMediaType,
  avatarMediaUrl: NullableString,
  avatarMimeType: NullableString,
  avatarFilename: NullableString,
});

export type CrewSummary = z.infer<typeof CrewSummarySchema>;

export const LogSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  path: z.string(),
  href: z.string(),
  body: NullableString,
  dateCode: NullableString,
  logDate: NullableString,
  headline: NullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
  tagline: NullableString,
  summary: NullableString,
  excerpt: NullableString,
  displayLabel: NullableString,
  owner: CrewSummarySchema.nullable().optional(),
  flightPlanId: z.number().nullable().optional(),
  flightPlanTombstone: z
    .object({
      id: NullableNumber,
      slug: NullableString,
      title: NullableString,
      location: NullableString,
      displayDate: NullableString,
      deletedAt: NullableString,
    })
    .nullable()
    .optional(),
});

export type LogSummary = z.infer<typeof LogSummarySchema>;

export const LogsResponseSchema = z.object({
  logs: z.array(LogSummarySchema),
  total: z.number().nonnegative(),
});

export type LogsResponse = z.infer<typeof LogsResponseSchema>;

export const PublicProfileSchema = z.object({
  id: z.number(),
  profileSlug: z.string(),
  callSign: NullableString,
  pronouns: NullableString,
  avatarUrl: NullableString,
  avatarMediaType: NullableAvatarMediaType,
  avatarMediaUrl: NullableString,
  avatarMimeType: NullableString,
  avatarFilename: NullableString,
  bio: NullableString,
  role: z.string(),
  skills: z.array(z.object({ label: z.string() })).optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  honorBadges: z.array(HonorBadgeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PublicProfile = z.infer<typeof PublicProfileSchema>;

export const ProfileRedirectSchema = z.object({
  profileSlug: z.string(),
});

export type ProfileRedirect = z.infer<typeof ProfileRedirectSchema>;

export const AdminModePreferencesSchema = z.object({
  adminViewEnabled: z.boolean(),
  adminEditEnabled: z.boolean(),
});

export type AdminModePreferences = z.infer<typeof AdminModePreferencesSchema>;

export const PrivateProfileSchema = PublicProfileSchema.extend({
  email: z.string().email(),
  firstName: NullableString,
  lastName: NullableString,
  adminModePreferences: AdminModePreferencesSchema.optional(),
});

export type PrivateProfile = z.infer<typeof PrivateProfileSchema>;

export const PublicProfileResponseSchema = z.object({
  profile: PublicProfileSchema.nullable(),
  redirectTo: ProfileRedirectSchema.optional(),
});

export const PrivateProfileResponseSchema = z.object({
  profile: PrivateProfileSchema.nullable(),
});

export const InvitationGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      profileSlug: NullableString,
      callSign: NullableString,
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
    }),
  ),
});

export type InvitationGraph = z.infer<typeof InvitationGraphSchema>;

export const NavigationNodeSchema = z.object({
  id: z.number(),
  nodeId: z.string(),
  label: z.string(),
  description: NullableString,
  sourcePath: NullableString,
});

export const NavigationNodesResponseSchema = z.object({
  docs: z.array(NavigationNodeSchema),
});

export type NavigationNode = z.infer<typeof NavigationNodeSchema>;

export const RoadmapPlanSchema = z.object({
  id: NullableString,
  title: z.string(),
  owner: NullableString,
  path: NullableString,
  status: NullableString,
  cloudStatus: NullableString,
});

export type RoadmapPlan = z.infer<typeof RoadmapPlanSchema>;

export const RoadmapItemSchema = z.object({
  id: z.string(),
  code: NullableString,
  title: z.string(),
  summary: NullableString,
  accessPolicy: NullableAccessPolicySchema.optional(),
  status: z.string(),
  cloudStatus: NullableString,
  referenceLabel: NullableString,
  referenceUrl: NullableString,
  plan: RoadmapPlanSchema.nullable().optional(),
});

export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;

export const RoadmapTierSchema = z.object({
  id: z.string(),
  tier: NullableString,
  title: z.string(),
  description: NullableString,
  accessPolicy: NullableAccessPolicySchema.optional(),
  focus: NullableString,
  statusSummary: NullableString,
  items: z.array(RoadmapItemSchema),
});

export type RoadmapTier = z.infer<typeof RoadmapTierSchema>;

export const RoadmapResponseSchema = z.object({
  generatedAt: NullableString,
  tiers: z.array(RoadmapTierSchema),
});

export type RoadmapResponse = z.infer<typeof RoadmapResponseSchema>;

const RoadmapPlanDocSchema = z.object({
  id: NullableString,
  title: NullableString,
  owner: NullableString,
  path: NullableString,
  status: NullableString,
  cloudStatus: NullableString,
});

const RoadmapItemDocSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  code: NullableString,
  title: NullableString,
  summary: NullableString,
  accessPolicy: NullableAccessPolicySchema.optional(),
  status: NullableString,
  cloudStatus: NullableString,
  referenceLabel: NullableString,
  referenceUrl: NullableString,
  plan: RoadmapPlanDocSchema.nullable().optional(),
});

const RoadmapTierDocSchema = z.object({
  id: z.union([z.number(), z.string()]),
  tierId: NullableString,
  tier: NullableString,
  title: z.string(),
  description: NullableString,
  accessPolicy: NullableAccessPolicySchema.optional(),
  focus: NullableString,
  statusSummary: NullableString,
  items: z.array(RoadmapItemDocSchema),
});

export const RoadmapTiersCmsResponseSchema = z.object({
  docs: z.array(RoadmapTierDocSchema),
});

export type RoadmapCmsResponse = z.infer<typeof RoadmapTiersCmsResponseSchema>;

const RichTextTextNodeSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
});

export type RichTextTextNode = z.infer<typeof RichTextTextNodeSchema>;

export type RichTextNode = {
  type?: string;
  url?: string;
  newTab?: boolean;
  children: Array<RichTextTextNode | RichTextNode>;
};

export const RichTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    url: z.string().optional(),
    newTab: z.boolean().optional(),
    children: z.array(z.union([RichTextTextNodeSchema, RichTextNodeSchema])),
  }),
);

type LegacyRichTextNode = RichTextNode | RichTextTextNode;

type LexicalNode = {
  type: string;
  children?: LexicalNode[];
  text?: string;
  format?: number | string;
  style?: string;
  tag?: string;
  listType?: string;
  url?: string;
  target?: string | null;
  rel?: string | null;
};

type LexicalDocument = {
  root?: {
    type?: string;
    children?: LexicalNode[];
  } | null;
};

const hasFormatFlag = (format: number | undefined, flag: number) =>
  typeof format === 'number' && (format & flag) === flag;

const extractFormatting = (
  format: unknown,
  style: unknown,
): Partial<Pick<RichTextTextNode, 'bold' | 'italic' | 'underline' | 'strikethrough'>> => {
  const numericFormat = typeof format === 'number' ? format : undefined;
  const stringFormats =
    typeof format === 'string'
      ? format
        .split(/\s+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      : [];
  const styleString = typeof style === 'string' ? style.toLowerCase() : '';
  const includesKeyword = (keyword: string) => stringFormats.includes(keyword);
  const includesStyle = (needle: string) => styleString.includes(needle);

  const result: Partial<Pick<RichTextTextNode, 'bold' | 'italic' | 'underline' | 'strikethrough'>> =
    {};

  if (hasFormatFlag(numericFormat, 1) || includesKeyword('bold') || includesStyle('bold')) {
    result.bold = true;
  }
  if (hasFormatFlag(numericFormat, 2) || includesKeyword('italic') || includesStyle('italic')) {
    result.italic = true;
  }
  if (
    hasFormatFlag(numericFormat, 4) ||
    includesKeyword('underline') ||
    includesStyle('underline')
  ) {
    result.underline = true;
  }
  if (
    hasFormatFlag(numericFormat, 8) ||
    includesKeyword('strikethrough') ||
    includesKeyword('struck') ||
    includesStyle('line-through') ||
    includesStyle('strikethrough')
  ) {
    result.strikethrough = true;
  }

  return result;
};

const convertLexicalChildren = (nodes?: LexicalNode[]): LegacyRichTextNode[] => {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => convertLexicalNode(node));
};

const isTextNode = (node: LegacyRichTextNode): node is RichTextTextNode => 'text' in node;

const asRichTextNode = (node: LegacyRichTextNode): node is RichTextNode =>
  typeof (node as RichTextNode)?.type === 'string';

const convertLexicalNode = (node: LexicalNode): LegacyRichTextNode[] => {
  if (!node || typeof node !== 'object') return [];

  switch (node.type) {
    case 'root':
      return convertLexicalChildren(node.children);
    case 'paragraph': {
      const children = convertLexicalChildren(node.children);
      return [
        {
          type: 'paragraph',
          children: children.length ? children : [{ text: '' }],
        },
      ];
    }
    case 'heading': {
      const tag = typeof node.tag === 'string' ? node.tag.toLowerCase() : 'h2';
      const allowedTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
      const headingTag = allowedTags.has(tag) ? tag : 'h2';
      return [
        {
          type: headingTag,
          children: convertLexicalChildren(node.children),
        },
      ];
    }
    case 'list': {
      const listType = node.listType === 'number' || node.listType === 'ordered' ? 'ol' : 'ul';
      const children = convertLexicalChildren(node.children).filter(
        (child): child is RichTextNode => asRichTextNode(child) && child.type === 'li',
      );
      return [{ type: listType, children }];
    }
    case 'listitem': {
      const children = convertLexicalChildren(node.children).filter(
        (child) => !isTextNode(child) || child.text.trim().length > 0,
      );
      return [{ type: 'li', children: children.length ? children : [{ text: '' }] }];
    }
    case 'listitemchild':
      return convertLexicalChildren(node.children);
    case 'link': {
      const children = convertLexicalChildren(node.children);
      return [
        {
          type: 'link',
          url: typeof node.url === 'string' ? node.url : undefined,
          newTab: node.target === '_blank' ? true : undefined,
          children,
        },
      ];
    }
    case 'linebreak':
      return [{ text: '\n' }];
    case 'text': {
      const text = typeof node.text === 'string' ? node.text : '';
      const formatting = extractFormatting(node.format, node.style);
      const entry: RichTextTextNode = { text };
      if (formatting.bold) entry.bold = true;
      if (formatting.italic) entry.italic = true;
      if (formatting.underline) entry.underline = true;
      if (formatting.strikethrough) entry.strikethrough = true;
      return [entry];
    }
    default:
      return convertLexicalChildren(node.children);
  }
};

const isLexicalDocument = (value: unknown): value is LexicalDocument => {
  if (!value || typeof value !== 'object') return false;
  const root = (value as LexicalDocument).root;
  return !!root && typeof root === 'object' && Array.isArray(root.children);
};

const convertLexicalDocument = (value: LexicalDocument): RichTextNode[] => {
  if (!isLexicalDocument(value)) return [];
  const legacyNodes = convertLexicalChildren(value.root?.children);
  return legacyNodes.filter(asRichTextNode);
};

const preprocessRichTextContent = (value: unknown): unknown => {
  if (value === undefined) return [];
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  if (isLexicalDocument(value)) {
    return convertLexicalDocument(value);
  }
  return value;
};

export const RichTextContentSchema = z.preprocess(
  preprocessRichTextContent,
  z.array(RichTextNodeSchema),
);
export type RichTextContent = z.infer<typeof RichTextContentSchema>;

export const PlanStatusSchema = z.enum(['queued', 'active', 'shipped', 'tested', 'canceled']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});
export type PlanLink = z.infer<typeof PlanLinkSchema>;

export const PlanRunLogSchema = z.object({
  title: z.string(),
  path: z.string(),
  date: NullableString,
});
export type PlanRunLog = z.infer<typeof PlanRunLogSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  owner: NullableString,
  accessPolicy: NullableAccessPolicySchema.optional(),
  tier: z.string(),
  status: PlanStatusSchema,
  cloudStatus: NullableString,
  summary: NullableString,
  lastUpdated: NullableString,
  path: NullableString,
  links: z.array(PlanLinkSchema).default([]),
  runLogs: z.array(PlanRunLogSchema).optional(),
  body: RichTextContentSchema.optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlansResponseSchema = z.object({
  generatedAt: NullableString,
  plans: z.array(PlanSchema),
});
export type PlansResponse = z.infer<typeof PlansResponseSchema>;

export const PlanDetailResponseSchema = z.object({
  generatedAt: NullableString,
  plan: PlanSchema.nullable(),
});
export type PlanDetailResponse = z.infer<typeof PlanDetailResponseSchema>;

const PlanCmsDocumentSchema = z.object({
  id: z.union([z.number(), z.string()]),
  planId: NullableString,
  slug: NullableString,
  title: NullableString,
  owner: NullableString,
  accessPolicy: NullableAccessPolicySchema.optional(),
  tier: NullableString,
  status: NullableString,
  cloudStatus: NullableString,
  summary: NullableString,
  lastUpdated: NullableString,
  path: NullableString,
  links: z.array(PlanLinkSchema).optional(),
  body: z.any().optional(),
});

export const PlansCmsResponseSchema = z.object({
  docs: z.array(PlanCmsDocumentSchema),
});

export type PlansCmsResponse = z.infer<typeof PlansCmsResponseSchema>;

export const FlightPlanGalleryAssetSchema = z.object({
  id: z.number(),
  url: z.string(),
  filename: NullableString.optional(),
  width: NullableNumber,
  height: NullableNumber,
  mimeType: NullableString,
  filesize: NullableNumber,
});
export type FlightPlanGalleryAsset = z.infer<typeof FlightPlanGalleryAssetSchema>;

export const GalleryMediaTypeSchema = z.enum(['image', 'video', 'audio', 'model']);
export type GalleryMediaType = z.infer<typeof GalleryMediaTypeSchema>;

export const FlightPlanGallerySlideSchema = z.object({
  label: NullableString,
  title: NullableString,
  description: NullableString,
  mediaType: GalleryMediaTypeSchema.optional(),
  imageType: z.enum(['upload', 'url']).default('upload'),
  imageUrl: z.string(),
  imageAlt: z.string(),
  creditLabel: NullableString,
  creditUrl: NullableString,
  asset: FlightPlanGalleryAssetSchema.nullable(),
});
export type FlightPlanGallerySlide = z.infer<typeof FlightPlanGallerySlideSchema>;

export const FlightPlanCategorySchema = z.enum(['test', 'project', 'event']);
export type FlightPlanCategory = z.infer<typeof FlightPlanCategorySchema>;

export const FlightPlanLifecycleStatusSchema = z.enum(FLIGHT_PLAN_LIFECYCLE_STATUSES);
export type FlightPlanLifecycleStatus = z.infer<typeof FlightPlanLifecycleStatusSchema>;

export const FlightPlanLifecycleBucketSchema = z.enum(FLIGHT_PLAN_LIFECYCLE_BUCKETS);
export type FlightPlanLifecycleBucket = z.infer<typeof FlightPlanLifecycleBucketSchema>;

export const FlightPlanStatusEventActionTypeSchema = z.enum(FLIGHT_PLAN_STATUS_EVENT_ACTION_TYPES);
export type FlightPlanStatusEventActionType = z.infer<typeof FlightPlanStatusEventActionTypeSchema>;

export const FlightPlanSeriesSummarySchema = z
  .object({
    id: z.number(),
    slug: z.string(),
    title: z.string(),
    category: FlightPlanCategorySchema,
  })
  .nullable()
  .optional();
export type FlightPlanSeriesSummary = z.infer<typeof FlightPlanSeriesSummarySchema>;

export const FlightPlanSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  href: z.string(),
  summary: NullableString,
  body: RichTextContentSchema,
  category: FlightPlanCategorySchema.default('project'),
  status: FlightPlanLifecycleStatusSchema.default('planned'),
  statusBucket: FlightPlanLifecycleBucketSchema.default('archived'),
  statusChangedAt: NullableString,
  statusChangedBy: CrewSummarySchema.nullable().optional(),
  statusReason: NullableString,
  startedAt: NullableString,
  finishedAt: NullableString,
  series: FlightPlanSeriesSummarySchema,
  iterationNumber: z.number().int().positive().default(1),
  previousIterationId: NullableNumber,
  location: NullableString,
  dateCode: NullableString,
  displayDate: NullableString,
  eventDate: NullableString,
  date: NullableString,
  ctaLabel: NullableString,
  ctaHref: NullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
  owner: CrewSummarySchema.nullable().optional(),
  crewPreview: z.array(CrewSummarySchema).default([]),
  accessPolicy: NullableAccessPolicySchema.optional(),
  visibility: z.enum(['public', 'passengers', 'crew', 'captain']).optional(),
  crewCanPromotePassengers: z.boolean().default(false),
  passengersCanCreateTasks: z.boolean().default(false),
  isPublic: z.boolean().default(false),
  publicContributions: z.boolean().default(false),
  gallerySlides: z.array(FlightPlanGallerySlideSchema).default([]),
  revision: z.number().int().positive().optional(),
  etag: z.string().optional(),
});

export type FlightPlanSummary = z.infer<typeof FlightPlanSummarySchema>;

export const FlightPlansResponseSchema = z.object({
  plans: z.array(FlightPlanSummarySchema),
  total: z.number().nonnegative(),
});

export type FlightPlansResponse = z.infer<typeof FlightPlansResponseSchema>;

export const FlightPlanTaskStateSchema = z.enum(FLIGHT_PLAN_TASK_STATES);
export type FlightPlanTaskState = z.infer<typeof FlightPlanTaskStateSchema>;

export const FlightPlanTaskLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable().optional(),
  addedByMembershipId: z.number().nullable().optional(),
  addedAt: z.string(),
});

export type FlightPlanTaskLink = z.infer<typeof FlightPlanTaskLinkSchema>;

export const FlightPlanTaskAttachmentSchema = z.object({
  id: z.string(),
  assetId: z.number(),
  filename: z.string().nullable(),
  url: z.string(),
  mimeType: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  addedByMembershipId: z.number().nullable().optional(),
  addedAt: z.string(),
});

export type FlightPlanTaskAttachment = z.infer<typeof FlightPlanTaskAttachmentSchema>;

export const FlightPlanTaskSchema = z.object({
  id: z.number(),
  flightPlanId: z.number(),
  title: z.string(),
  description: RichTextContentSchema.optional(),
  state: FlightPlanTaskStateSchema,
  listOrder: z.number().nullable().optional(),
  ownerMembershipId: z.number(),
  owner: CrewSummarySchema.nullable(),
  assigneeMembershipIds: z.array(z.number()).default([]),
  assignees: z.array(CrewSummarySchema).default([]),
  attachments: z.array(FlightPlanTaskAttachmentSchema).default([]),
  links: z.array(FlightPlanTaskLinkSchema).default([]),
  isCrewOnly: z.boolean().default(false),
  version: z.number().int().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FlightPlanTask = z.infer<typeof FlightPlanTaskSchema>;

export const FlightPlanTasksResponseSchema = z.object({
  tasks: z.array(FlightPlanTaskSchema),
  total: z.number().nonnegative(),
  etag: z.string().optional(),
});

export type FlightPlanTasksResponse = z.infer<typeof FlightPlanTasksResponseSchema>;

export const CommentSortSchema = z.enum(['best', 'top', 'new', 'old', 'controversial']);
export type CommentSort = z.infer<typeof CommentSortSchema>;

export type CommentNode = {
  id: number;
  threadId: number;
  parentCommentId?: number | null;
  bodyRaw: string;
  bodyHtml: string;
  mentionMembershipIds: number[];
  mentions: z.infer<typeof CrewSummarySchema>[];
  createdById?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  score: number;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  lastActivityAt?: string | null;
  viewerVote: number;
  author: z.infer<typeof CrewSummarySchema> | null;
  children: CommentNode[];
};

export const CommentNodeSchema: z.ZodType<CommentNode> = z.lazy(() =>
  z.object({
    id: z.number(),
    threadId: z.number(),
    parentCommentId: NullableNumber,
    bodyRaw: z.string(),
    bodyHtml: z.string(),
    mentionMembershipIds: z.array(z.number()).default([]),
    mentions: z.array(CrewSummarySchema).default([]),
    createdById: NullableNumber,
    editedAt: NullableString,
    deletedAt: NullableString,
    createdAt: z.string(),
    updatedAt: z.string(),
    score: z.number(),
    upvotes: z.number(),
    downvotes: z.number(),
    replyCount: z.number(),
    lastActivityAt: NullableString,
    viewerVote: z.number().int().min(-1).max(1).default(0),
    author: CrewSummarySchema.nullable(),
    children: z.array(CommentNodeSchema),
  }),
);


export const CommentThreadSchema = z.object({
  id: z.number(),
  resourceType: z.string(),
  resourceId: z.number(),
  createdById: NullableNumber,
  locked: z.boolean(),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalComments: z.number().nonnegative(),
  comments: z.array(CommentNodeSchema),
  viewer: z.object({
    canComment: z.boolean(),
    canVote: z.boolean(),
    canModerate: z.boolean(),
  }),
});

export type CommentThread = z.infer<typeof CommentThreadSchema>;

export const CommentThreadResponseSchema = z.object({
  thread: CommentThreadSchema,
});

export type CommentThreadResponse = z.infer<typeof CommentThreadResponseSchema>;

export {
  FLIGHT_PLAN_TASK_STATES,
  getFlightPlanTaskStateMeta,
  sortFlightPlanTaskStates,
  type FlightPlanTaskStateMeta,
} from './taskStates';

const LinkSchema = z.object({
  label: z.string(),
  href: z.string(),
  style: z.enum(['primary', 'secondary', 'link']).optional(),
});

export type Link = z.infer<typeof LinkSchema>;

export const HeroBlockSchema = z.object({
  blockType: z.literal('hero'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  eyebrow: z.string().nullable().optional(),
  title: z.string(),
  tagline: RichTextContentSchema.optional(),
  body: RichTextContentSchema.optional(),
  ctas: z.array(LinkSchema).optional(),
});

export type HeroBlock = z.infer<typeof HeroBlockSchema>;

export const CardGridBlockSchema = z.object({
  blockType: z.literal('cardGrid'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string().nullable().optional(),
  intro: RichTextContentSchema.optional(),
  columns: z.enum(['one', 'two', 'three']).optional(),
  cards: z.array(
    z.object({
      variant: z.enum(['static', 'flightPlans', 'logs', 'links']).optional(),
      badge: z.string().nullable().optional(),
      title: z.string(),
      body: RichTextContentSchema.optional(),
      ctas: z.array(LinkSchema).optional(),
      config: z
        .object({
          limit: z.number().int().positive().optional(),
          minRole: z.string().optional(),
          emptyLabel: z.string().optional(),
        })
        .nullable()
        .optional(),
    }),
  ),
});

export type CardGridBlock = z.infer<typeof CardGridBlockSchema>;

export const CTAListBlockSchema = z.object({
  blockType: z.literal('ctaList'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string(),
  intro: RichTextContentSchema.optional(),
  items: z.array(
    z.object({
      title: z.string(),
      description: RichTextContentSchema.optional(),
      cta: LinkSchema.optional(),
    }),
  ),
});

export type CTAListBlock = z.infer<typeof CTAListBlockSchema>;

export const TimelineBlockSchema = z.object({
  blockType: z.literal('timeline'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string(),
  intro: RichTextContentSchema.optional(),
  items: z.array(
    z.object({
      heading: z.string(),
      timestamp: z.string().nullable().optional(),
      body: RichTextContentSchema,
    }),
  ),
});

export type TimelineBlock = z.infer<typeof TimelineBlockSchema>;

const GalleryImageRelationSchema = z
  .union([
    RelationshipIdentifierSchema,
    z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        filename: z.string().optional(),
        url: NullableString,
        thumbnailURL: NullableString,
        sizes: z
          .object({
            preview: z.object({ url: NullableString }).nullable().optional(),
            thumbnail: z.object({ url: NullableString }).nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough(),
  ])
  .nullable()
  .optional();

export const ImageCarouselSlideSchema = z.object({
  title: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  mediaType: GalleryMediaTypeSchema.optional(),
  imageType: z.enum(['upload', 'url']).default('upload'),
  galleryImage: GalleryImageRelationSchema,
  imageUrl: z.string().nullable().optional(),
  imageAlt: z.string(),
  caption: z.string().nullable().optional(),
  creditLabel: z.string().nullable().optional(),
  creditUrl: z.string().nullable().optional(),
});

export type ImageCarouselSlide = z.infer<typeof ImageCarouselSlideSchema>;

export const ImageCarouselBlockSchema = z.object({
  blockType: z.literal('imageCarousel'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string().nullable().optional(),
  intro: RichTextContentSchema.optional(),
  slides: z.array(ImageCarouselSlideSchema).min(1),
});

export type ImageCarouselBlock = z.infer<typeof ImageCarouselBlockSchema>;

export const StatGridBlockSchema = z.object({
  blockType: z.literal('statGrid'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string(),
  intro: RichTextContentSchema.optional(),
  stats: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
    }),
  ),
  ctas: z.array(LinkSchema).optional(),
});

export type StatGridBlock = z.infer<typeof StatGridBlockSchema>;

export const CrewPreviewBlockSchema = z.object({
  blockType: z.literal('crewPreview'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string(),
  description: RichTextContentSchema.optional(),
  minRole: z.string().nullable().optional(),
  limit: z.number().nullable().optional(),
  cta: LinkSchema.optional(),
});

export type CrewPreviewBlock = z.infer<typeof CrewPreviewBlockSchema>;

export const CrewRosterBlockSchema = z.object({
  blockType: z.literal('crewRoster'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  badge: z.string().optional(),
  title: z.string(),
  description: RichTextContentSchema.optional(),
  mode: z.enum(['preview', 'full']).optional(),
  limit: z.number().nonnegative().optional(),
  ctas: z.array(LinkSchema).optional(),
});

export type CrewRosterBlock = z.infer<typeof CrewRosterBlockSchema>;

export const NavigationModuleBlockSchema = z.object({
  blockType: z.literal('navigationModule'),
  accessPolicy: NullableAccessPolicySchema.optional(),
  title: z.string().optional(),
  description: RichTextContentSchema.optional(),
  nodeId: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
});

export type NavigationModuleBlock = z.infer<typeof NavigationModuleBlockSchema>;

export const PageBlockSchema = z.discriminatedUnion('blockType', [
  HeroBlockSchema,
  CardGridBlockSchema,
  CTAListBlockSchema,
  TimelineBlockSchema,
  ImageCarouselBlockSchema,
  StatGridBlockSchema,
  CrewPreviewBlockSchema,
  CrewRosterBlockSchema,
  NavigationModuleBlockSchema,
]);

export type PageBlock = z.infer<typeof PageBlockSchema>;

const preprocessPageDocument = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  const doc = { ...(value as Record<string, unknown>) };
  doc.layout = sanitizePageBlocks(doc.layout as PageBlock[] | null);
  doc.navigation =
    sanitizeNavigationOverrides(doc.navigation as PageDocument['navigation']) ?? null;
  if (
    doc.owner != null &&
    (typeof doc.owner === 'string' || typeof doc.owner === 'number')
  ) {
    doc.owner = null;
  }
  return doc;
};

const BasePageDocumentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  path: z.string(),
  summary: z.string().nullable().optional(),
  accessPolicy: NullableAccessPolicySchema.optional(),
  owner: CrewSummarySchema.nullable().optional(),
  navigation: z
    .object({
      nodeId: z.string().optional(),
      label: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  layout: z.array(PageBlockSchema),
  editor: PageEditorRulesSchema.nullable().optional(),
  revision: z.number().int().positive().optional(),
  etag: z.string().optional(),
});

export const PageDocumentSchema = z.preprocess(preprocessPageDocument, BasePageDocumentSchema);

export type PageDocument = z.infer<typeof PageDocumentSchema>;

export const PageListResponseSchema = z.object({
  docs: z.array(PageDocumentSchema),
  totalDocs: z.number().nonnegative(),
  limit: z.number().optional(),
  totalPages: z.number().optional(),
  page: z.number().optional(),
});

export type PageListResponse = z.infer<typeof PageListResponseSchema>;
