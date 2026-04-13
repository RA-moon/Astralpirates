import { fetchPlansFromCms } from '../shared/plans';
import {
  createPlansSnapshotPayload,
  DEFAULT_PLAN_OUTPUTS,
  writePlansSnapshotPayload,
} from './lib/plans-snapshot';

const resolveBaseUrl = () =>
  process.env.ASTRAL_API_BASE || process.env.NUXT_PUBLIC_ASTRAL_API_BASE || '';

async function main() {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    throw new Error('Set ASTRAL_API_BASE or NUXT_PUBLIC_ASTRAL_API_BASE to sync plans from CMS.');
  }

  const plans = await fetchPlansFromCms({ baseUrl });
  if (!plans || plans.plans.length === 0) {
    throw new Error('No plans returned from CMS; aborting sync.');
  }

  const payload = createPlansSnapshotPayload(plans.plans, plans.generatedAt);
  await writePlansSnapshotPayload(payload);

  console.log(
    `Synced ${plans.plans.length} plans from CMS to ${DEFAULT_PLAN_OUTPUTS[0]} and ${DEFAULT_PLAN_OUTPUTS[1]}`,
  );
}

void main().catch((error) => {
  console.error('[plan:sync] Failed to sync plans from CMS');
  console.error(error);
  process.exitCode = 1;
});
