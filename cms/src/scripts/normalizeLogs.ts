import payload from 'payload';
import payloadConfig from '../../payload.config.ts';
import { slugify } from '../../app/api/_lib/slugs.ts';

type LogDocument = {
  id: number | string;
  slug?: string | null;
  dateCode?: string | null;
  path?: string | null;
  logDate?: string | null;
  title?: string | null;
  owner?: number | string | { id: number | string } | null;
};

const DIGIT_PATTERN = /\d+/g;

const padTimestamp = (digits: string): string => {
  const clean = digits.replace(/[^0-9]/g, '');
  if (clean.length >= 14) {
    return clean.slice(0, 14);
  }
  if (clean.length >= 8) {
    return `${clean.slice(0, 8)}${clean.slice(8).padEnd(6, '0')}`.slice(0, 14);
  }
  return clean;
};

const parseTimestamp = (stamp: string): Date | null => {
  if (stamp.length !== 14) return null;
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  const hour = Number(stamp.slice(8, 10));
  const minute = Number(stamp.slice(10, 12));
  const second = Number(stamp.slice(12, 14));
  if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveOwnerSlug = async (log: LogDocument): Promise<string> => {
  const ownerRaw = log.owner;
  const ownerId =
    typeof ownerRaw === 'object' && ownerRaw !== null && 'id' in ownerRaw
      ? (ownerRaw as { id: number | string }).id
      : ownerRaw ?? null;
  if (!ownerId) return 'crew';
  try {
    const owner = await payload.findByID({
      collection: 'users',
      id: ownerId,
      depth: 0,
      overrideAccess: true,
    });
    const token = owner.profileSlug ?? owner.callSign ?? owner.email?.split('@')[0] ?? `${owner.id}`;
    return slugify(token) || 'crew';
  } catch (error) {
    payload.logger.warn({ err: error, ownerId }, 'Failed to load owner while normalizing logs');
    return 'crew';
  }
};

const normalizeLogs = async () => {
  await payload.init({ config: payloadConfig });

  let page = 1;
  const limit = 100;
  let updated = 0;

  while (true) {
    const result = await payload.find<LogDocument>({
      collection: 'logs',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    });

    if (!result.docs.length) {
      break;
    }

    for (const log of result.docs) {
      const digits = [log.slug, log.dateCode, log.path]
        .map((value) => (typeof value === 'string' ? value.match(DIGIT_PATTERN)?.join('') ?? '' : ''))
        .find((candidate) => candidate.length > 0) ?? '';

      const normalizedStamp = padTimestamp(digits);
      if (!normalizedStamp) continue;

      const date = parseTimestamp(normalizedStamp) ?? new Date(Date.UTC(Number(normalizedStamp.slice(0, 4)), Number(normalizedStamp.slice(4, 6)) - 1, Number(normalizedStamp.slice(6, 8)), 0, 0, 0));
      const finalStamp = normalizedStamp.padEnd(14, '0').slice(0, 14);
      const ownerToken = await resolveOwnerSlug(log);
      const desiredTitle = `${ownerToken}-log ${finalStamp}`;
      const desiredPath = `logbook/logs/${finalStamp}`;

      const shouldUpdate =
        log.slug !== finalStamp ||
        log.path !== desiredPath ||
        log.dateCode !== finalStamp ||
        !log.logDate ||
        log.title !== desiredTitle;

      if (!shouldUpdate) {
        continue;
      }

      await payload.update({
        collection: 'logs',
        id: log.id,
        data: {
          slug: finalStamp,
          path: desiredPath,
          dateCode: finalStamp,
          logDate: date.toISOString(),
          title: desiredTitle,
        },
        overrideAccess: true,
      });
      updated += 1;
    }

    const currentPage = result.page ?? page;
    const totalPages = result.totalPages ?? currentPage;
    if (currentPage >= totalPages) break;
    page = currentPage + 1;
  }

  payload.logger.info({ updated }, 'Normalized log timestamps');
  process.exit(0);
};

normalizeLogs().catch((error) => {
  console.error(error);
  process.exit(1);
});
