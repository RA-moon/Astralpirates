const DAY_MS = 24 * 60 * 60 * 1000;
const numberFormatter = new Intl.NumberFormat('en-US');

export const formatCount = (value) => numberFormatter.format(Number(value ?? 0));

export const formatDelta = (value) => {
  const delta = Number(value ?? 0);
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${formatCount(delta)}`;
};

const toUtcMidnight = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfWeekUtc = (date, weekStart = 1) => {
  const utcMidnight = toUtcMidnight(date);
  const day = utcMidnight.getUTCDay();
  const diff = (day - weekStart + 7) % 7;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - diff);
  return utcMidnight;
};

export const resolveWeeklySummaryWindow = ({ start = '', end = '', now = new Date(), weekStart = 1 } = {}) => {
  if ((start && !end) || (!start && end)) {
    throw new Error('Both --start and --end must be provided together.');
  }

  if (start && end) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new Error('Invalid --start or --end timestamp. Use ISO 8601 strings.');
    }
    if (startMs >= endMs) {
      throw new Error('Start must be before end for a custom window.');
    }
    return { start: new Date(startMs), end: new Date(endMs) };
  }

  const currentWeekStart = startOfWeekUtc(now, weekStart);
  return {
    start: new Date(currentWeekStart.getTime() - 7 * DAY_MS),
    end: new Date(currentWeekStart.getTime()),
  };
};

export const formatWeeklySummaryMessage = ({
  startIso,
  endIso,
  totals,
  deltas,
  activity,
  planningLines = [],
  sourceBaseUrl,
}) => {
  const header = `Weekly Summary (${startIso.slice(0, 10)} → ${endIso.slice(0, 10)} UTC)`;
  const lines = [
    header,
    `Users: ${formatCount(totals?.users)} (${formatDelta(deltas?.users)} vs prev)`,
    activity ? `Active crew: ${formatCount(activity.activeUsers)} (${formatDelta(activity.delta)} vs prev)` : '',
    `Flight plans: ${formatCount(totals?.flightPlans)} (${formatDelta(deltas?.flightPlans)} vs prev)`,
    `Logs: ${formatCount(totals?.logs)} (${formatDelta(deltas?.logs)} vs prev)`,
    ...planningLines,
    `Source: ${sourceBaseUrl}`,
  ];

  return lines.filter(Boolean).join('\n');
};

