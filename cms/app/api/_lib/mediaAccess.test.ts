import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEffectiveAdminMode } from '@astralpirates/shared/adminMode';

import {
  isMediaGovernanceEnforced,
  resolveAvatarFileReadAccess,
  resolveFlightPlanMediaVisibility,
  resolveGalleryFileReadAccess,
  resolveMediaGovernanceMode,
  resolveMediaDownloadAccess,
  resolveMediaModifyAccess,
  resolveTaskAttachmentFileReadAccess,
} from './mediaAccess';
import * as flightPlanMembers from './flightPlanMembers';
import * as pageEditorAccess from './pageEditorAccess';

type MockPayload = {
  find: ReturnType<typeof vi.fn>;
  findByID: ReturnType<typeof vi.fn>;
  logger: {
    warn: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
};

const collectFilenameEqualsValues = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const directEquals =
    record.filename &&
    typeof record.filename === 'object' &&
    'equals' in (record.filename as Record<string, unknown>) &&
    typeof (record.filename as { equals?: unknown }).equals === 'string'
      ? [((record.filename as { equals?: string }).equals as string).trim()]
      : [];

  const orValues = Array.isArray(record.or)
    ? record.or.flatMap((entry) => collectFilenameEqualsValues(entry))
    : [];
  return [...directEquals, ...orValues].filter((entry) => entry.length > 0);
};

const makePayload = ({
  assets = [],
  taskAttachments = [],
  flightPlans = {},
  pages = {},
  tasks = {},
}: {
  assets?: Array<Record<string, unknown>>;
  taskAttachments?: Array<Record<string, unknown>>;
  flightPlans?: Record<number, Record<string, unknown>>;
  pages?: Record<number, Record<string, unknown>>;
  tasks?: Record<number, Record<string, unknown>>;
} = {}): MockPayload => {
  const find = vi.fn(async (args: Record<string, unknown>) => {
    const where = args.where;
    const collection = args.collection;
    const filenameCandidates = new Set(collectFilenameEqualsValues(where));
    const sourceDocs =
      collection === 'gallery-images'
        ? assets
        : collection === 'task-attachments'
          ? taskAttachments
          : [];
    const docs = sourceDocs.filter((asset) => {
      const filename =
        typeof asset.filename === 'string' ? asset.filename.trim() : '';
      return filename.length > 0 && filenameCandidates.has(filename);
    });
    return { docs };
  });

  const findByID = vi.fn(async (args: Record<string, unknown>) => {
    const collection = args.collection;
    const id =
      typeof args.id === 'number'
        ? args.id
        : typeof args.id === 'string'
          ? Number.parseInt(args.id, 10)
          : Number.NaN;

    if (!Number.isFinite(id)) {
      throw new Error('Invalid id');
    }

    if (collection === 'flight-plans') {
      const doc = flightPlans[id];
      if (!doc) throw new Error('Flight plan not found');
      return doc;
    }

    if (collection === 'pages') {
      const doc = pages[id];
      if (!doc) throw new Error('Page not found');
      return doc;
    }

    if (collection === 'flight-plan-tasks') {
      const doc = tasks[id];
      if (!doc) throw new Error('Task not found');
      return doc;
    }

    throw new Error(`Unsupported collection: ${String(collection)}`);
  });

  return {
    find,
    findByID,
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isMediaGovernanceEnforced', () => {
  const originalEnforced = process.env.MEDIA_GOVERNANCE_ENFORCED;
  const originalMode = process.env.MEDIA_GOVERNANCE_MODE;

  afterEach(() => {
    if (typeof originalEnforced === 'string') {
      process.env.MEDIA_GOVERNANCE_ENFORCED = originalEnforced;
    } else {
      delete process.env.MEDIA_GOVERNANCE_ENFORCED;
    }
    if (typeof originalMode === 'string') {
      process.env.MEDIA_GOVERNANCE_MODE = originalMode;
    } else {
      delete process.env.MEDIA_GOVERNANCE_MODE;
    }
  });

  it('accepts truthy env values', () => {
    process.env.MEDIA_GOVERNANCE_ENFORCED = 'true';
    expect(isMediaGovernanceEnforced()).toBe(true);
  });

  it('honors MEDIA_GOVERNANCE_MODE=enforce', () => {
    delete process.env.MEDIA_GOVERNANCE_ENFORCED;
    process.env.MEDIA_GOVERNANCE_MODE = 'enforce';
    expect(resolveMediaGovernanceMode()).toBe('enforce');
    expect(isMediaGovernanceEnforced()).toBe(true);
  });

  it('supports MEDIA_GOVERNANCE_MODE=shadow', () => {
    process.env.MEDIA_GOVERNANCE_MODE = 'shadow';
    expect(resolveMediaGovernanceMode()).toBe('shadow');
    expect(isMediaGovernanceEnforced()).toBe(false);
  });

  it('defaults to false when not set', () => {
    delete process.env.MEDIA_GOVERNANCE_MODE;
    delete process.env.MEDIA_GOVERNANCE_ENFORCED;
    expect(isMediaGovernanceEnforced()).toBe(false);
  });
});

describe('resolveFlightPlanMediaVisibility', () => {
  it('defaults to inherit', () => {
    expect(resolveFlightPlanMediaVisibility(undefined)).toBe('inherit');
    expect(resolveFlightPlanMediaVisibility('invalid')).toBe('inherit');
  });

  it('accepts crew_only', () => {
    expect(resolveFlightPlanMediaVisibility('crew_only')).toBe('crew_only');
  });
});

describe('resolveGalleryFileReadAccess', () => {
  it('returns 404 when no gallery asset matches the requested path', async () => {
    const payload = makePayload();

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'missing.jpg',
    });

    expect(result).toEqual({
      allow: false,
      status: 404,
      error: 'Gallery asset not found.',
    });
  });

  it('allows page-scoped media when page policy is public', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 100,
          filename: 'page-asset.jpg',
          page: 7,
        },
      ],
      pages: {
        7: {
          id: 7,
          owner: 1,
          accessPolicy: { mode: 'public' },
        },
      },
    });

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'page-asset.jpg',
    });

    expect(result).toEqual({ allow: true });
  });

  it('denies page-scoped media when page policy is private and viewer is anonymous', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 101,
          filename: 'private-page.jpg',
          page: 8,
        },
      ],
      pages: {
        8: {
          id: 8,
          owner: 42,
          accessPolicy: { mode: 'private' },
        },
      },
    });

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'private-page.jpg',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to view this media.',
    });
  });

  it('allows flight-plan media when mission policy is public', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 201,
          filename: 'public-plan.jpg',
          flightPlan: 11,
        },
      ],
      flightPlans: {
        11: {
          id: 11,
          owner: 77,
          accessPolicy: { mode: 'public' },
          visibility: 'public',
          isPublic: true,
          publicContributions: true,
        },
      },
    });

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'public-plan.jpg',
    });

    expect(result).toEqual({ allow: true });
  });

  it('denies flight-plan media when mission policy requires membership and viewer is anonymous', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 202,
          filename: 'private-plan.jpg',
          flightPlan: 12,
        },
      ],
      flightPlans: {
        12: {
          id: 12,
          owner: 77,
          accessPolicy: {
            mode: 'role',
            roleSpace: 'flight-plan',
            minimumRole: 'passenger',
          },
          visibility: 'passengers',
          isPublic: false,
          publicContributions: false,
        },
      },
    });

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'private-plan.jpg',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to view this media.',
    });
  });

  it('denies anonymous viewers when mission media visibility is crew_only', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 205,
          filename: 'crew-only-media.jpg',
          flightPlan: 16,
        },
      ],
      flightPlans: {
        16: {
          id: 16,
          owner: 77,
          accessPolicy: { mode: 'public' },
          visibility: 'public',
          isPublic: true,
          publicContributions: false,
          mediaVisibility: 'crew_only',
        },
      },
    });

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'crew-only-media.jpg',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to view this media.',
    });
  });

  it('denies unscoped gallery assets in governance mode', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 301,
          filename: 'unscoped.jpg',
          page: null,
          flightPlan: null,
        },
      ],
    });

    const result = await resolveGalleryFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'unscoped.jpg',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'Gallery asset is not attached to a governed owner.',
    });
  });
});

describe('resolveTaskAttachmentFileReadAccess', () => {
  const makeAcceptedMembership = (role: 'owner' | 'crew' | 'guest') => ({
    id: 8,
    flightPlanId: 44,
    userId: 15,
    role,
    status: 'accepted' as const,
    invitedById: null,
    invitedAt: null,
    respondedAt: null,
  });

  it('returns 404 when no task attachment matches the requested path', async () => {
    const payload = makePayload();

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'missing.pdf',
    });

    expect(result).toEqual({
      allow: false,
      status: 404,
      error: 'Task attachment not found.',
    });
  });

  it('denies anonymous users for task attachment reads', async () => {
    const payload = makePayload({
      taskAttachments: [
        {
          id: 1001,
          filename: 'task-attachment.pdf',
          flightPlan: 44,
          task: 701,
        },
      ],
      flightPlans: {
        44: {
          id: 44,
          owner: 9,
        },
      },
      tasks: {
        701: {
          id: 701,
          flightPlan: 44,
          isCrewOnly: false,
        },
      },
    });

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'task-attachment.pdf',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to view this media.',
    });
  });

  it('allows anonymous viewers when mission policy is public and media visibility inherits', async () => {
    const payload = makePayload({
      taskAttachments: [
        {
          id: 1006,
          filename: 'public-task.pdf',
          flightPlan: 44,
          task: 706,
        },
      ],
      flightPlans: {
        44: {
          id: 44,
          owner: 9,
          accessPolicy: { mode: 'public' },
          visibility: 'public',
          isPublic: true,
          publicContributions: false,
          mediaVisibility: 'inherit',
        },
      },
      tasks: {
        706: {
          id: 706,
          flightPlan: 44,
          isCrewOnly: false,
        },
      },
    });

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'public-task.pdf',
    });

    expect(result).toEqual({ allow: true });
  });

  it('denies anonymous viewers when mission media visibility is crew_only', async () => {
    const payload = makePayload({
      taskAttachments: [
        {
          id: 1007,
          filename: 'public-task-crew-only.pdf',
          flightPlan: 44,
          task: 707,
        },
      ],
      flightPlans: {
        44: {
          id: 44,
          owner: 9,
          accessPolicy: { mode: 'public' },
          visibility: 'public',
          isPublic: true,
          publicContributions: false,
          mediaVisibility: 'crew_only',
        },
      },
      tasks: {
        707: {
          id: 707,
          flightPlan: 44,
          isCrewOnly: false,
        },
      },
    });

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: null,
      relativePath: 'public-task-crew-only.pdf',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to view this media.',
    });
  });

  it('allows accepted passengers when the task is not crew-only', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue(
      makeAcceptedMembership('guest') as any,
    );
    const payload = makePayload({
      taskAttachments: [
        {
          id: 1002,
          filename: 'guest-visible.pdf',
          flightPlan: 44,
          task: 702,
        },
      ],
      flightPlans: {
        44: {
          id: 44,
          owner: 9,
        },
      },
      tasks: {
        702: {
          id: 702,
          flightPlan: 44,
          isCrewOnly: false,
        },
      },
    });

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: { id: 15, role: 'seamen' } as any,
      relativePath: 'guest-visible.pdf',
    });

    expect(result).toEqual({ allow: true });
  });

  it('denies accepted passengers when the task is crew-only', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue(
      makeAcceptedMembership('guest') as any,
    );
    const payload = makePayload({
      taskAttachments: [
        {
          id: 1003,
          filename: 'crew-only.pdf',
          flightPlan: 44,
          task: 703,
        },
      ],
      flightPlans: {
        44: {
          id: 44,
          owner: 9,
        },
      },
      tasks: {
        703: {
          id: 703,
          flightPlan: 44,
          isCrewOnly: true,
        },
      },
    });

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: { id: 15, role: 'seamen' } as any,
      relativePath: 'crew-only.pdf',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to view this media.',
    });
  });

  it('denies attachments whose task scope does not match the recorded flight plan', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue(
      makeAcceptedMembership('crew') as any,
    );
    const payload = makePayload({
      taskAttachments: [
        {
          id: 1004,
          filename: 'mismatch.pdf',
          flightPlan: 44,
          task: 704,
        },
      ],
      flightPlans: {
        44: {
          id: 44,
          owner: 9,
        },
      },
      tasks: {
        704: {
          id: 704,
          flightPlan: 99,
          isCrewOnly: false,
        },
      },
    });

    const result = await resolveTaskAttachmentFileReadAccess({
      payload: payload as any,
      user: { id: 15, role: 'seamen' } as any,
      relativePath: 'mismatch.pdf',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'Task attachment scope is invalid.',
    });
  });
});

describe('resolveMediaModifyAccess', () => {
  it('allows flight-plan gallery modifications when canEditFlightPlan permits', async () => {
    vi.spyOn(flightPlanMembers, 'canEditFlightPlan').mockResolvedValue(true);

    const result = await resolveMediaModifyAccess({
      scope: 'flight-plan-gallery',
      payload: makePayload() as any,
      user: { id: 17, role: 'captain' } as any,
      flightPlanId: 44,
      ownerIdHint: 9,
    });

    expect(result).toEqual({ allow: true });
  });

  it('denies flight-plan gallery modifications when canEditFlightPlan blocks', async () => {
    vi.spyOn(flightPlanMembers, 'canEditFlightPlan').mockResolvedValue(false);

    const result = await resolveMediaModifyAccess({
      scope: 'flight-plan-gallery',
      payload: makePayload() as any,
      user: { id: 17, role: 'captain' } as any,
      flightPlanId: 44,
      ownerIdHint: 9,
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to modify this media.',
    });
  });

  it('returns page context when page-gallery modify access is allowed', async () => {
    vi.spyOn(pageEditorAccess, 'resolvePageEditAccess').mockResolvedValue({
      page: { id: 51, layout: [] } as any,
      canEdit: true,
    });

    const result = await resolveMediaModifyAccess({
      scope: 'page-gallery',
      payload: makePayload() as any,
      user: { id: 17, role: 'captain' } as any,
      pageId: 51,
    });

    expect(result).toEqual({
      allow: true,
      page: { id: 51, layout: [] },
    });
  });

  it('returns 404 when page-gallery modify access cannot resolve a page', async () => {
    vi.spyOn(pageEditorAccess, 'resolvePageEditAccess').mockResolvedValue({
      page: null,
      canEdit: false,
    });

    const result = await resolveMediaModifyAccess({
      scope: 'page-gallery',
      payload: makePayload() as any,
      user: { id: 17, role: 'captain' } as any,
      pageId: 777,
    });

    expect(result).toEqual({
      allow: false,
      status: 404,
      error: 'Page not found.',
    });
  });

  it('allows avatar modifications only for the avatar owner', async () => {
    const ownerResult = await resolveMediaModifyAccess({
      scope: 'avatar',
      user: { id: 33, role: 'seamen' } as any,
      ownerUserId: 33,
    });
    expect(ownerResult).toEqual({ allow: true });

    const nonOwnerResult = await resolveMediaModifyAccess({
      scope: 'avatar',
      user: { id: 99, role: 'captain' } as any,
      ownerUserId: 33,
    });
    expect(nonOwnerResult).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to modify this media.',
    });
  });

  it('allows task-attachment upload for accepted passenger contributors', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue({
      id: 55,
      role: 'guest',
      status: 'accepted',
    } as any);

    const result = await resolveMediaModifyAccess({
      scope: 'task-attachment',
      payload: makePayload() as any,
      user: { id: 17, role: 'seamen' } as any,
      action: 'upload',
      flightPlanId: 44,
      ownerIdHint: 9,
      passengersCanCreateTasks: true,
      isCrewOnly: false,
      taskOwnerMembershipId: 55,
    });

    expect(result).toEqual({
      allow: true,
      membership: {
        id: 55,
        role: 'guest',
      },
    });
  });

  it('denies task-attachment upload for crew-only tasks when viewer is passenger', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue({
      id: 55,
      role: 'guest',
      status: 'accepted',
    } as any);

    const result = await resolveMediaModifyAccess({
      scope: 'task-attachment',
      payload: makePayload() as any,
      user: { id: 17, role: 'seamen' } as any,
      action: 'upload',
      flightPlanId: 44,
      ownerIdHint: 9,
      passengersCanCreateTasks: true,
      isCrewOnly: true,
      taskOwnerMembershipId: 55,
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'Crew-only tasks limit attachments to captains and crew organisers.',
    });
  });

  it('denies task-attachment delete when passenger is not the task owner', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue({
      id: 72,
      role: 'guest',
      status: 'accepted',
    } as any);

    const result = await resolveMediaModifyAccess({
      scope: 'task-attachment',
      payload: makePayload() as any,
      user: { id: 17, role: 'seamen' } as any,
      action: 'delete',
      flightPlanId: 44,
      ownerIdHint: 9,
      passengersCanCreateTasks: true,
      isCrewOnly: false,
      taskOwnerMembershipId: 55,
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'Only captains, crew organisers, or the task owner can remove attachments.',
    });
  });

  it('auto-elevates captain admin-edit for task-attachment uploads without membership', async () => {
    vi.spyOn(flightPlanMembers, 'loadMembershipWithOwnerFallback').mockResolvedValue(null);
    const ensureCrewMembershipSpy = vi
      .spyOn(flightPlanMembers, 'ensureCrewMembership')
      .mockResolvedValue({
        id: 91,
        role: 'crew',
        status: 'accepted',
      } as any);

    const result = await resolveMediaModifyAccess({
      scope: 'task-attachment',
      payload: makePayload() as any,
      user: { id: 17, role: 'captain' } as any,
      action: 'upload',
      flightPlanId: 44,
      ownerIdHint: 9,
      passengersCanCreateTasks: false,
      isCrewOnly: false,
      adminMode: resolveEffectiveAdminMode({
        role: 'captain',
        adminViewRequested: true,
        adminEditRequested: true,
      }),
    });

    expect(result).toEqual({
      allow: true,
      membership: {
        id: 91,
        role: 'crew',
      },
    });
    expect(ensureCrewMembershipSpy).toHaveBeenCalledWith({
      payload: expect.anything(),
      flightPlanId: 44,
      userId: 17,
      inviterId: 9,
    });
  });
});

describe('resolveMediaDownloadAccess', () => {
  it('allows gallery download for the flight-plan owner', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 8001,
          filename: 'owner-gallery.jpg',
          flightPlan: 321,
        },
      ],
      flightPlans: {
        321: {
          id: 321,
          owner: 44,
        },
      },
    });

    const result = await resolveMediaDownloadAccess({
      scope: 'gallery-file',
      payload: payload as any,
      user: { id: 44, role: 'seamen' } as any,
      relativePath: 'owner-gallery.jpg',
    });

    expect(result).toEqual({ allow: true });
  });

  it('denies gallery download for non-owner viewers', async () => {
    const payload = makePayload({
      assets: [
        {
          id: 8002,
          filename: 'non-owner-gallery.jpg',
          flightPlan: 321,
        },
      ],
      flightPlans: {
        321: {
          id: 321,
          owner: 44,
        },
      },
    });

    const result = await resolveMediaDownloadAccess({
      scope: 'gallery-file',
      payload: payload as any,
      user: { id: 99, role: 'seamen' } as any,
      relativePath: 'non-owner-gallery.jpg',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to download this media.',
    });
  });

  it('denies task attachment download for captains when admin view is disabled', async () => {
    const payload = makePayload({
      taskAttachments: [
        {
          id: 9001,
          filename: 'captain-task.pdf',
          flightPlan: 654,
          task: 222,
        },
      ],
      flightPlans: {
        654: {
          id: 654,
          owner: 7,
        },
      },
      tasks: {
        222: {
          id: 222,
          flightPlan: 654,
          isCrewOnly: true,
        },
      },
    });

    const result = await resolveMediaDownloadAccess({
      scope: 'task-attachment-file',
      payload: payload as any,
      user: { id: 999, role: 'captain' } as any,
      relativePath: 'captain-task.pdf',
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to download this media.',
    });
  });

  it('allows task attachment download for captains when admin view is enabled', async () => {
    const payload = makePayload({
      taskAttachments: [
        {
          id: 9001,
          filename: 'captain-task.pdf',
          flightPlan: 654,
          task: 222,
        },
      ],
      flightPlans: {
        654: {
          id: 654,
          owner: 7,
        },
      },
      tasks: {
        222: {
          id: 222,
          flightPlan: 654,
          isCrewOnly: true,
        },
      },
    });

    const result = await resolveMediaDownloadAccess({
      scope: 'task-attachment-file',
      payload: payload as any,
      user: { id: 999, role: 'captain' } as any,
      relativePath: 'captain-task.pdf',
      adminMode: resolveEffectiveAdminMode({
        role: 'captain',
        adminViewRequested: true,
      }),
    });

    expect(result).toEqual({ allow: true });
  });

  it('records governance audit metadata when admin override grants download', async () => {
    const originalAuditEnabled = process.env.MEDIA_GOV_AUDIT_ENABLED;
    const originalAuditMode = process.env.MEDIA_GOV_AUDIT_MODE;
    process.env.MEDIA_GOV_AUDIT_ENABLED = 'true';
    process.env.MEDIA_GOV_AUDIT_MODE = 'all';

    try {
      const payload = makePayload({
        taskAttachments: [
          {
            id: 9001,
            filename: 'captain-task.pdf',
            flightPlan: 654,
            task: 222,
          },
        ],
      });

      const result = await resolveMediaDownloadAccess({
        scope: 'task-attachment-file',
        payload: payload as any,
        user: { id: 999, role: 'captain' } as any,
        relativePath: 'captain-task.pdf',
        adminMode: resolveEffectiveAdminMode({
          role: 'captain',
          adminViewRequested: true,
        }),
      });

      expect(result).toEqual({ allow: true });
      expect(payload.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media_governance_access',
          scope: 'task-attachment-file',
          action: 'download',
          decision: 'allow',
          capability: 'adminReadAllContent',
        }),
        '[media-governance] access allowed',
      );
    } finally {
      if (typeof originalAuditEnabled === 'string') {
        process.env.MEDIA_GOV_AUDIT_ENABLED = originalAuditEnabled;
      } else {
        delete process.env.MEDIA_GOV_AUDIT_ENABLED;
      }
      if (typeof originalAuditMode === 'string') {
        process.env.MEDIA_GOV_AUDIT_MODE = originalAuditMode;
      } else {
        delete process.env.MEDIA_GOV_AUDIT_MODE;
      }
    }
  });

  it('denies avatar download for non-captains', async () => {
    const result = await resolveMediaDownloadAccess({
      scope: 'avatar-file',
      user: { id: 10, role: 'seamen' } as any,
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'You do not have permission to download this media.',
    });
  });
});

describe('resolveAvatarFileReadAccess', () => {
  it('allows avatar reads by default policy', () => {
    expect(resolveAvatarFileReadAccess()).toEqual({ allow: true });
  });
});
