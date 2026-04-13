import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

export const PLAN_SNAPSHOT_OUTPUT = path.join(ROOT, 'frontend/app/generated/plans.json');
export const PLAN_SEED_OUTPUT = path.join(ROOT, 'cms/seed/data/plans.json');
export const DEFAULT_PLAN_OUTPUTS = [PLAN_SNAPSHOT_OUTPUT, PLAN_SEED_OUTPUT] as const;

export type PlansSnapshotPayload<T = unknown> = {
  generatedAt: string;
  plans: T[];
};

export const createPlansSnapshotPayload = <T>(
  plans: T[],
  generatedAt?: string | null,
): PlansSnapshotPayload<T> => ({
  generatedAt: generatedAt ?? new Date().toISOString(),
  plans,
});

export async function writePlansSnapshotPayload<T>(
  payload: PlansSnapshotPayload<T>,
  outputs: readonly string[] = DEFAULT_PLAN_OUTPUTS,
): Promise<void> {
  const json = JSON.stringify(payload, null, 2);
  await Promise.all(
    outputs.map(async (outputPath) => {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, json, 'utf8');
    }),
  );
}
