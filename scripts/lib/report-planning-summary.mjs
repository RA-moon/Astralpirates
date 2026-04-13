import { collectPlanningCommitSummary, toPlanningSummaryLines } from './planning-change-summary.mjs';

export const buildPlanningSummaryLines = async ({
  startIso,
  endIso,
  maxEntries,
  windowLabel,
}) => {
  const summary = await collectPlanningCommitSummary({
    startIso,
    endIso,
    maxEntries,
  });

  return toPlanningSummaryLines({
    summary,
    windowLabel,
  });
};
