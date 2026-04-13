import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
} from 'payload';
import { lexicalEditor } from '@payloadcms/richtext-lexical';

import { FLIGHT_PLAN_TASK_STATES } from '@astralpirates/shared/taskStates';
import { TEST_RUN_CADENCE_OPTIONS } from '../constants/testRunCadences';
import {
  clearOwnerMediaReferences,
  queueMediaDelete,
  syncTaskAttachmentReferencesForTask,
} from '../services/mediaLifecycle';

const toNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && String(parsed) === value) return parsed;
  }
  return null;
};

const extractAttachmentAssetIds = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const assetId = toNumericId(record.assetId);
    if (assetId != null) {
      ids.add(assetId);
      continue;
    }
    if (typeof record.id === 'string' && record.id.startsWith('attachment-')) {
      const parsed = toNumericId(record.id.slice('attachment-'.length));
      if (parsed != null) ids.add(parsed);
    }
  }
  return Array.from(ids);
};

const pruneTaskAttachmentsOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const taskId = toNumericId((doc as any)?.id);
  if (taskId == null) return;

  const assetIds = new Set<number>(extractAttachmentAssetIds((doc as any)?.attachments));

  try {
    const result = await req.payload.find({
      collection: 'task-attachments',
      where: { task: { equals: taskId } },
      depth: 0,
      limit: 50,
      overrideAccess: true,
    });
    for (const attachment of result.docs) {
      const id = toNumericId((attachment as any)?.id);
      if (id != null) assetIds.add(id);
    }
  } catch (error) {
    req.payload.logger?.warn?.(
      { err: error, taskId },
      '[flight-plan-tasks] failed to load attachments for deleted task',
    );
  }

  if (!assetIds.size) return;

  for (const assetId of assetIds) {
    try {
      await queueMediaDelete({
        payload: req.payload,
        assetClass: 'task',
        assetId,
        mode: 'force',
        reason: 'task-delete-cascade',
        requestedByUserId: toNumericId((req.user as { id?: unknown } | null | undefined)?.id),
      });
    } catch (error) {
      req.payload.logger?.warn?.(
        { err: error, taskId, assetId },
        '[flight-plan-tasks] failed to delete attachment for deleted task',
      );
    }
  }
};

const syncTaskAttachmentReferenceLedger: CollectionAfterChangeHook = async ({ doc, req }) => {
  const taskId = toNumericId((doc as { id?: unknown } | null | undefined)?.id);
  if (taskId == null) return doc;

  await syncTaskAttachmentReferencesForTask({
    payload: req.payload,
    taskId,
    attachments: (doc as { attachments?: unknown } | null | undefined)?.attachments,
    actorUserId: toNumericId((req.user as { id?: unknown } | null | undefined)?.id),
  });

  return doc;
};

const clearTaskAttachmentReferenceLedgerOnDelete: CollectionAfterDeleteHook = async ({
  doc,
  id,
  req,
}) => {
  const taskId = toNumericId((doc as { id?: unknown } | null | undefined)?.id ?? id);
  if (taskId == null) return;

  await clearOwnerMediaReferences({
    payload: req.payload,
    assetClass: 'task',
    ownerType: 'task',
    ownerId: taskId,
    fieldPath: 'attachments',
    actorUserId: toNumericId((req.user as { id?: unknown } | null | undefined)?.id),
  });
};

const FlightPlanTasks: CollectionConfig = {
  slug: 'flight-plan-tasks',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'state', 'flightPlan'],
  },
  timestamps: true,
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: true,
      index: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Short label for the task (max 120 characters).',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || !value.trim().length) {
          return 'Task title is required.';
        }
        if (value.trim().length > 120) {
          return 'Task title must be 120 characters or less.';
        }
        return true;
      },
    },
    {
      name: 'description',
      type: 'richText',
      editor: lexicalEditor(),
      required: false,
    },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'ideation',
      options: FLIGHT_PLAN_TASK_STATES.map((state) => ({
        label: state.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        value: state,
      })),
      admin: {
        description: 'Current stage of the task.',
      },
    },
    {
      name: 'testRunCadence',
      label: 'Test run cadence',
      type: 'select',
      required: false,
      options: TEST_RUN_CADENCE_OPTIONS,
      admin: {
        description: 'Draft trigger for QA/ELSA tests (OnTouch, OnUpdate, Repeat tiers, or Never).',
      },
    },
    {
      name: 'listOrder',
      type: 'number',
      required: false,
      admin: {
        description: 'Used to sort tasks inside each state column.',
      },
    },
    {
      name: 'ownerMembership',
      label: 'Owner membership',
      type: 'relationship',
      relationTo: 'flight-plan-memberships',
      required: true,
      index: true,
    },
    {
      name: 'assigneeMembershipIds',
      label: 'Assignee membership ids',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Stored as membership ids; managed through the mission task APIs.',
      },
    },
    {
      name: 'attachments',
      label: 'Attachments',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Managed via the mission task attachment APIs.',
        readOnly: true,
      },
    },
    {
      name: 'links',
      label: 'Links',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Managed via the mission task link APIs.',
        readOnly: true,
      },
    },
    {
      name: 'isCrewOnly',
      label: 'Crew-only visibility',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Mask task content for passengers and contributors when enabled.',
      },
    },
    {
      name: 'version',
      label: 'Version',
      type: 'number',
      defaultValue: 1,
      required: true,
      admin: {
        description: 'Auto-incremented by the mission task APIs.',
        readOnly: true,
      },
    },
  ],
  hooks: {
    afterChange: [syncTaskAttachmentReferenceLedger],
    afterDelete: [
      clearTaskAttachmentReferenceLedgerOnDelete,
      pruneTaskAttachmentsOnDelete,
    ],
  },
};

export default FlightPlanTasks;
