import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { CAPTAIN_ROLE, DEFAULT_CREW_ROLE } from '@astralpirates/shared/crewRoles';
import { crewProfiles } from './crewProfiles';
import { closeNeo4jDriver } from '../utils/neo4j';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { resolveCaptainInviterId, resolveUserId } from '../utils/invitedBy';

const run = async (): Promise<void> => {
  const payloadInstance = await payload.init({
    config: payloadConfig,
  });

  try {
    let captainInviterId = await resolveCaptainInviterId(payloadInstance);

    for (const member of crewProfiles) {
      const email = member.email.toLowerCase();

      const { docs } = await payloadInstance.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
      });

      const sharedData = {
        password: member.password,
        role: member.role ?? DEFAULT_CREW_ROLE,
        isTestUser: member.isTestUser,
        accountType: member.accountType,
        callSign: member.callSign,
        pronouns: member.pronouns,
        avatarUrl: member.avatarUrl,
        bio: member.bio,
        profileSlug: member.profileSlug,
        skills: member.skills,
        links: member.links,
      } as const;

      if (docs.length > 0) {
        const identityUpdates: Record<string, unknown> = {};
        const existing = docs[0] as any;
        const existingInviterId = resolveUserId(existing?.invitedBy);
        if (!existing.firstName && member.firstName) {
          identityUpdates.firstName = member.firstName;
        }
        if (!existing.lastName && member.lastName) {
          identityUpdates.lastName = member.lastName;
        }
        if (member.role !== CAPTAIN_ROLE && existingInviterId == null && captainInviterId != null) {
          identityUpdates.invitedBy = captainInviterId;
        }
        await payloadInstance.update({
          collection: 'users',
          id: docs[0].id,
          data: {
            ...identityUpdates,
            ...sharedData,
          },
          overrideAccess: true,
          context: {
            skipProfileSlugAssignment: true,
            allowProfileSlugWrite: true,
            skipProfileSlugSync: true,
          },
        });
        payload.logger.info({ email }, 'Updated crew member');
        if (member.role === CAPTAIN_ROLE && captainInviterId == null) {
          captainInviterId = resolveUserId(docs[0].id);
        }
      } else {
        if (member.role !== CAPTAIN_ROLE && captainInviterId == null) {
          throw new Error('No captain account found. Seed a captain before creating non-captain crew members.');
        }

        await payloadInstance.create({
          collection: 'users',
          data: {
            email,
            firstName: member.firstName,
            lastName: member.lastName,
            ...sharedData,
            invitedBy: member.role === CAPTAIN_ROLE ? undefined : captainInviterId ?? undefined,
          },
          overrideAccess: true,
          context: {
            skipProfileSlugAssignment: true,
            allowProfileSlugWrite: true,
            skipProfileSlugSync: true,
          },
        });
        payload.logger.info({ email }, 'Created crew member');
        if (member.role === CAPTAIN_ROLE && captainInviterId == null) {
          const captain = await payloadInstance.find({
            collection: 'users',
            where: { email: { equals: email } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          });
          captainInviterId = resolveUserId(captain.docs[0]?.id);
        }
      }
    }

    payload.logger.info('Crew profiles synced');
  } finally {
    await closePayloadLifecycle(payloadInstance);

    await closeNeo4jDriver();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
