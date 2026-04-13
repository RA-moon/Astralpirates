import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as membersModule from '@/app/api/_lib/flightPlanMembers';
import * as tasksModule from '@/app/api/_lib/flightPlanTasks';
import * as mediaAccessModule from '@/app/api/_lib/mediaAccess';
import * as mediaLifecycleModule from '@/src/services/mediaLifecycle';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const makeTask = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 99,
  flightPlanId: 77,
  ownerMembershipId: 5,
  title: 'Task',
  description: [],
  state: 'ideation',
  listOrder: 1,
  assigneeMembershipIds: [],
  attachments: [],
  links: [],
  isCrewOnly: false,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createUploadRequest = (fileName = 'report.txt', content = 'attachment body') => {
  const formData = new FormData();
  formData.append('file', new File([content], fileName, { type: 'text/plain' }));
  return new Request('https://example.com/api/flight-plans/demo/tasks/99/attachments', {
    method: 'POST',
    body: formData,
  }) as unknown as any;
};

const createDeleteRequest = (attachmentId: string) =>
  ({
    method: 'DELETE',
    headers: new Headers(),
    nextUrl: new URL(
      `https://example.com/api/flight-plans/demo/tasks/99/attachments?attachmentId=${encodeURIComponent(
        attachmentId,
      )}`,
    ),
    json: vi.fn().mockResolvedValue({}),
  }) as unknown as any;

const requireResponse = <T>(value: T | undefined): T => {
  expect(value).toBeDefined();
  if (value === undefined) {
    throw new Error('Route handler returned undefined response');
  }
  return value;
};

describe('task attachment routes god-mode coverage', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      create: vi.fn().mockResolvedValue({
        id: 444,
        filename: 'report.txt',
        url: '/api/task-attachments/file/report.txt',
        mimeType: 'text/plain',
        filesize: 14,
      }),
      update: vi.fn().mockResolvedValue({}),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockAuth = {
      user: { id: 42, role: 'captain' } as any,
      payload,
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    };

    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue(mockAuth);
    vi.spyOn(authModule, 'buildRequestForUser').mockResolvedValue({} as any);
    vi.spyOn(membersModule, 'resolveFlightPlanBySlug').mockResolvedValue({
      id: 77,
      owner: 11,
      slug: 'demo',
      title: 'Demo Mission',
      passengersCanCreateTasks: false,
      publicContributions: false,
    } as any);
    vi.spyOn(tasksModule, 'loadTaskById').mockResolvedValue(makeTask() as any);
    vi.spyOn(tasksModule, 'buildMembershipSummaryMap').mockResolvedValue({
      membershipMap: new Map([[33, { id: 33, userId: 42, role: 'crew' }]]),
      summaryByMembership: new Map(),
    } as any);
    vi.spyOn(tasksModule, 'serializeTask').mockImplementation((task: any) => task);
    vi.spyOn(mediaAccessModule, 'resolveMediaModifyAccess').mockResolvedValue({
      allow: true,
      membership: { id: 33, role: 'crew' },
    } as any);
    vi
      .spyOn(mediaLifecycleModule, 'queueMediaDelete')
      .mockResolvedValue({ queued: true, missingAsset: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit attachment upload without pre-existing membership', async () => {
    const response = requireResponse(
      await POST(createUploadRequest(), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mediaAccessModule.resolveMediaModifyAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'task-attachment',
        action: 'upload',
        flightPlanId: 77,
        adminMode: expect.objectContaining({
          adminViewEnabled: true,
          adminEditEnabled: true,
        }),
      }),
    );
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'task-attachments',
        overrideAccess: true,
      }),
    );
    expect(body.attachment).toEqual(
      expect.objectContaining({
        assetId: 444,
        filename: 'report.txt',
        addedByMembershipId: 33,
      }),
    );
  });

  it('allows captain admin-edit attachment removal without pre-existing membership', async () => {
    const existing = {
      id: 'attachment-444',
      assetId: 444,
      filename: 'report.txt',
      url: '/api/task-attachments/file/report.txt',
      mimeType: 'text/plain',
      size: 14,
      thumbnailUrl: null,
      addedByMembershipId: 33,
      addedAt: '2026-04-10T00:00:00.000Z',
    };
    (tasksModule.loadTaskById as any)
      .mockResolvedValueOnce(makeTask({ attachments: [existing], version: 1 }))
      .mockResolvedValueOnce(makeTask({ attachments: [], version: 2 }));

    const response = requireResponse(
      await DELETE(createDeleteRequest('attachment-444'), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mediaAccessModule.resolveMediaModifyAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'task-attachment',
        action: 'delete',
        flightPlanId: 77,
        adminMode: expect.objectContaining({
          adminViewEnabled: true,
          adminEditEnabled: true,
        }),
      }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plan-tasks',
        id: 99,
        data: expect.objectContaining({
          attachments: [],
          version: 2,
        }),
        overrideAccess: true,
      }),
    );
    expect(mediaLifecycleModule.queueMediaDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        assetClass: 'task',
        assetId: 444,
        mode: 'safe',
        requestedByUserId: 42,
      }),
    );
  });

  it('keeps denying non-members when admin-edit override is unavailable', async () => {
    mockAuth.user = { id: 88, role: 'seamen' } as any;
    mockAuth.adminMode = {
      adminViewEnabled: false,
      adminEditEnabled: false,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;
    vi.spyOn(mediaAccessModule, 'resolveMediaModifyAccess').mockResolvedValueOnce({
      allow: false,
      status: 403,
      error: 'Crew access required.',
    } as any);

    const response = requireResponse(
      await POST(createUploadRequest(), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Crew access required.' });
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    mockAuth.user = { id: 88, role: 'seamen' } as any;
    mockAuth.adminMode = {
      adminViewEnabled: true,
      adminEditEnabled: true,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;
    vi.spyOn(mediaAccessModule, 'resolveMediaModifyAccess').mockResolvedValueOnce({
      allow: false,
      status: 403,
      error: 'Crew access required.',
    } as any);

    const response = requireResponse(
      await POST(createUploadRequest(), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Crew access required.' });
    expect(mediaAccessModule.resolveMediaModifyAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        adminMode: expect.objectContaining({
          adminViewEnabled: true,
          adminEditEnabled: true,
        }),
      }),
    );
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});
