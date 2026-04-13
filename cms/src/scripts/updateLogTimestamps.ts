import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { runLogMaintenance, updateLogDoc } from './_lib/logMaintenance';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const parseDateFromLog = (log: any): Date | null => {
  const fromLogDate = typeof log.logDate === 'string' && log.logDate ? new Date(log.logDate) : null;
  if (fromLogDate && !Number.isNaN(fromLogDate.getTime())) {
    fromLogDate.setUTCHours(0, 0, 0, 0);
    return fromLogDate;
  }

  const dateCode = typeof log.dateCode === 'string' ? log.dateCode : null;
  if (dateCode) {
    const digits = dateCode.replace(/[^0-9]/g, '');
    if (digits.length >= 8) {
      const day = digits.slice(-8, -6);
      const month = digits.slice(-6, -4);
      const year = digits.slice(-4);
      const iso = `${year}-${month}-${day}T00:00:00.000Z`;
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  if (typeof log.slug === 'string') {
    const digits = log.slug.replace(/[^0-9]/g, '');
    if (digits.length >= 8) {
      const day = digits.slice(-8, -6);
      const month = digits.slice(-6, -4);
      const year = digits.slice(-4);
      const iso = `${year}-${month}-${day}T00:00:00.000Z`;
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
};

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  const { processed, updated } = await runLogMaintenance({
    payload,
    onDoc: async (doc) => {
      const targetDate = parseDateFromLog(doc);
      if (!targetDate) {
        return false;
      }

      const targetIso = targetDate.toISOString();
      const currentCreated = typeof doc.createdAt === 'string' ? doc.createdAt : null;
      if (currentCreated === targetIso) {
        return false;
      }

      await updateLogDoc({
        payload,
        id: doc.id,
        data: {
          createdAt: targetIso,
          updatedAt: targetIso,
        },
      });
      return true;
    },
  });

  payload.logger.info({ processed, updated }, 'Updated log timestamps');

  await closePayloadLifecycle(payload);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
