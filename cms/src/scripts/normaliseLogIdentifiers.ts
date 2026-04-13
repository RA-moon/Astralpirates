import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { runLogMaintenance, updateLogDoc } from './_lib/logMaintenance';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

type LogDoc = {
  id: number;
  slug?: string | null;
  path?: string | null;
  dateCode?: string | null;
  logDate?: string | null;
  createdAt?: string | null;
  title?: string | null;
};

const formatStamp = (date: Date): string => {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

const TIMESTAMP_LENGTH = 14;

const extractDigits = (value: unknown): string => (typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '');

const normaliseDigits = (raw: string): string | null => {
  if (!raw) return null;
  if (raw.length < 8) return null;
  if (raw.length >= TIMESTAMP_LENGTH) {
    return raw.slice(0, TIMESTAMP_LENGTH);
  }
  return raw.padEnd(TIMESTAMP_LENGTH, '0');
};

const parseStampToDate = (stamp: string): Date | null => {
  if (stamp.length !== TIMESTAMP_LENGTH) return null;
  const year = Number.parseInt(stamp.slice(0, 4), 10);
  const month = Number.parseInt(stamp.slice(4, 6), 10);
  const day = Number.parseInt(stamp.slice(6, 8), 10);
  const hours = Number.parseInt(stamp.slice(8, 10), 10);
  const minutes = Number.parseInt(stamp.slice(10, 12), 10);
  const seconds = Number.parseInt(stamp.slice(12, 14), 10);

  if (
    Number.isNaN(year)
    || Number.isNaN(month)
    || Number.isNaN(day)
    || Number.isNaN(hours)
    || Number.isNaN(minutes)
    || Number.isNaN(seconds)
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  return Number.isNaN(date.getTime()) ? null : date;
};

const deriveStamp = (doc: LogDoc): { stamp: string; date: Date } => {
  const candidates = [
    extractDigits(doc.dateCode),
    extractDigits(doc.slug),
    extractDigits(doc.path),
  ];

  let digits: string | null = null;
  for (const candidate of candidates) {
    const normalised = normaliseDigits(candidate);
    if (normalised) {
      digits = normalised;
      break;
    }
  }

  const createdAt = typeof doc.createdAt === 'string' ? new Date(doc.createdAt) : null;
  const createdValid = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;

  if (!digits) {
    if (!createdValid) {
      throw new Error(`Unable to derive timestamp for log ${doc.id}`);
    }
    return { stamp: formatStamp(createdValid), date: createdValid };
  }

  const parsed = parseStampToDate(digits);
  if (parsed) {
    return { stamp: digits, date: parsed };
  }

  const fallback = createdValid ?? new Date();
  return { stamp: formatStamp(fallback), date: fallback };
};

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  const { processed, updated } = await runLogMaintenance({
    payload,
    onDoc: async (rawDoc) => {
      const doc = rawDoc as LogDoc;
      let stampResult: { stamp: string; date: Date };
      try {
        stampResult = deriveStamp(doc);
      } catch (error) {
        payload.logger.warn({ err: error, id: doc.id }, 'Skipping log without resolvable timestamp');
        return false;
      }
      const { stamp, date } = stampResult;
      const slug = stamp;
      const path = `logbook/logs/${slug}`;
      const title = `Log ${stamp}`;

      const needsUpdate =
        doc.slug !== slug
        || doc.path !== path
        || doc.title !== title
        || doc.dateCode !== stamp
        || doc.logDate !== date.toISOString();

      if (!needsUpdate) {
        return false;
      }

      await updateLogDoc({
        payload,
        id: doc.id,
        data: {
          title,
          slug,
          path,
          dateCode: stamp,
          logDate: date.toISOString(),
        },
      });
      return true;
    },
  });

  payload.logger.info({ processed, updated }, 'Normalised log identifiers');

  await closePayloadLifecycle(payload);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
