process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { normaliseId } from '@/app/api/_lib/flightPlanMembers';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

type MembershipDoc = {
  id: number | string;
  flightPlan?: unknown;
  user?: unknown;
  invitedAt?: string | null;
  respondedAt?: string | null;
};

const toStringField = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const run = async () => {
  await payload.init({ config: payloadConfig });
  try {
    const result = await payload.find({
      collection: 'flight-plan-memberships',
      where: {
        and: [
          { role: { equals: 'guest' } },
          { invitationStatus: { equals: 'accepted' } },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    const flagged = (result.docs as MembershipDoc[]).filter(
      (doc) => !toStringField(doc.respondedAt),
    );

    if (!flagged.length) {
      console.log('No guest membership anomalies detected.');
      return;
    }

    const flightPlanIds = new Set<number>();
    const userIds = new Set<number>();
    flagged.forEach((doc) => {
      const planId = normaliseId(doc.flightPlan);
      if (planId != null) flightPlanIds.add(planId);
      const userId = normaliseId(doc.user);
      if (userId != null) userIds.add(userId);
    });

    const [plansResult, usersResult] = await Promise.all([
      flightPlanIds.size
        ? payload.find({
            collection: 'flight-plans',
            where: { id: { in: Array.from(flightPlanIds) } },
            depth: 0,
            limit: flightPlanIds.size,
            overrideAccess: true,
          })
        : Promise.resolve({ docs: [] as any[] }),
      userIds.size
        ? payload.find({
            collection: 'users',
            where: { id: { in: Array.from(userIds) } },
            depth: 0,
            limit: userIds.size,
            overrideAccess: true,
          })
        : Promise.resolve({ docs: [] as any[] }),
    ]);

    const planMap = new Map<number, { slug: string | null; title: string | null }>();
    for (const doc of plansResult.docs as any[]) {
      const id = normaliseId(doc?.id);
      if (id == null) continue;
      planMap.set(id, {
        slug: toStringField(doc?.slug),
        title: toStringField(doc?.title),
      });
    }

    const userMap = new Map<number, { callSign: string | null; profileSlug: string | null }>();
    for (const doc of usersResult.docs as any[]) {
      const id = normaliseId(doc?.id);
      if (id == null) continue;
      userMap.set(id, {
        callSign: toStringField(doc?.callSign),
        profileSlug: toStringField(doc?.profileSlug),
      });
    }

    console.log('membershipId\tflightPlan\tuser\tinvitedAt');
    flagged.forEach((doc) => {
      const membershipId = normaliseId(doc.id) ?? doc.id;
      const planId = normaliseId(doc.flightPlan);
      const userId = normaliseId(doc.user);
      const planSummary = planId != null ? planMap.get(planId) : null;
      const userSummary = userId != null ? userMap.get(userId) : null;

      const planLabel = planId != null
        ? `${planId}:${planSummary?.slug ?? planSummary?.title ?? 'unknown'}`
        : 'unknown-plan';
      const userLabel = userId != null
        ? `${userId}:${userSummary?.profileSlug ?? userSummary?.callSign ?? 'unknown'}`
        : 'unknown-user';

      console.log(
        `${membershipId}\t${planLabel}\t${userLabel}\t${doc.invitedAt ?? 'unspecified'}`,
      );
    });
  } finally {
    await closePayloadLifecycle(payload);
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
