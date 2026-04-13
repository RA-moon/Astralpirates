type LogsPageResult<TLogDoc> = {
  docs: TLogDoc[];
  page: number;
  totalPages: number;
};

type LogsPayloadLike<TLogDoc> = {
  find: (args: {
    collection: 'logs';
    limit: number;
    page: number;
    depth: 0;
    overrideAccess: true;
    showHiddenFields: true;
  }) => Promise<LogsPageResult<TLogDoc>>;
};

type RunLogMaintenanceParams<TLogDoc> = {
  payload: LogsPayloadLike<TLogDoc>;
  onDoc: (doc: TLogDoc) => Promise<boolean>;
  limit?: number;
};

type RunLogMaintenanceResult = {
  processed: number;
  updated: number;
};

type UpdateLogsPayloadLike<TData> = {
  update: (args: {
    collection: 'logs';
    id: number | string;
    data: TData;
    overrideAccess: true;
    showHiddenFields: true;
  }) => Promise<unknown>;
};

export const runLogMaintenance = async <TLogDoc>({
  payload,
  onDoc,
  limit = 100,
}: RunLogMaintenanceParams<TLogDoc>): Promise<RunLogMaintenanceResult> => {
  let page = 1;
  let processed = 0;
  let updated = 0;

  while (true) {
    const res = await payload.find({
      collection: 'logs',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    });

    if (!res.docs.length) {
      break;
    }

    for (const doc of res.docs) {
      processed += 1;
      const didUpdate = await onDoc(doc);
      if (didUpdate) {
        updated += 1;
      }
    }

    if (res.page >= res.totalPages) {
      break;
    }

    page += 1;
  }

  return { processed, updated };
};

export const updateLogDoc = async <TData>({
  payload,
  id,
  data,
}: {
  payload: UpdateLogsPayloadLike<TData>;
  id: number | string;
  data: TData;
}): Promise<void> => {
  await payload.update({
    collection: 'logs',
    id,
    data,
    overrideAccess: true,
    showHiddenFields: true,
  });
};
