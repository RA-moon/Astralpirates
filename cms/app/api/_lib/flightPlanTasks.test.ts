import { describe, expect, it, vi } from 'vitest';

import {
  buildTaskAttachmentProxyUrl,
  loadTaskById,
  normalizeTaskAttachmentUrl,
  resolveTaskAttachmentDeliveryUrl,
} from './flightPlanTasks';

describe('task attachment URL helpers', () => {
  it('builds proxy URLs for task attachment filenames', () => {
    expect(buildTaskAttachmentProxyUrl('mission note.pdf')).toBe(
      '/api/task-attachments/file/mission%20note.pdf',
    );
  });

  it('normalizes legacy /media/tasks paths to proxy URLs', () => {
    expect(normalizeTaskAttachmentUrl('/media/tasks/plan-7-note.pdf')).toBe(
      '/api/task-attachments/file/plan-7-note.pdf',
    );
    expect(
      normalizeTaskAttachmentUrl('/media/tasks/plan-7-note.pdf?X-Amz-Signature=abc'),
    ).toBe('/api/task-attachments/file/plan-7-note.pdf');
    expect(
      normalizeTaskAttachmentUrl(
        'https://cms.astralpirates.com/media/tasks/plan-7-note.pdf',
      ),
    ).toBe('/api/task-attachments/file/plan-7-note.pdf');
  });

  it('keeps external URLs unchanged when they are not internal task media paths', () => {
    expect(normalizeTaskAttachmentUrl('https://example.com/file.pdf')).toBe(
      'https://example.com/file.pdf',
    );
  });

  it('prefers filename-derived proxy URLs for delivery', () => {
    expect(
      resolveTaskAttachmentDeliveryUrl({
        filename: 'plan-5-report.pdf',
        url: 'https://cms.astralpirates.com/media/tasks/legacy.pdf',
      }),
    ).toBe('/api/task-attachments/file/plan-5-report.pdf');
  });
});

describe('loadTaskById attachment normalization', () => {
  it('normalizes stored attachment URLs to proxy URLs', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 99,
        flightPlan: 77,
        ownerMembership: 5,
        title: 'Attachment task',
        description: [],
        state: 'ideation',
        listOrder: 1,
        assigneeMembershipIds: [],
        attachments: [
          {
            id: 'attachment-123',
            assetId: 123,
            filename: 'plan-77-note.pdf',
            url: 'https://cms.astralpirates.com/media/tasks/plan-77-note.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            addedAt: '2026-03-13T12:00:00.000Z',
          },
        ],
        links: [],
        isCrewOnly: false,
        version: 3,
        createdAt: '2026-03-13T11:59:00.000Z',
        updatedAt: '2026-03-13T12:00:00.000Z',
      }),
      logger: {
        warn: vi.fn(),
      },
    } as any;

    const task = await loadTaskById(payload, 99);
    expect(task).toBeTruthy();
    expect(task?.attachments).toHaveLength(1);
    expect(task?.attachments[0]?.url).toBe('/api/task-attachments/file/plan-77-note.pdf');
  });
});
