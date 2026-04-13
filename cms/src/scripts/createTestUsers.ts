import payload from 'payload';
import payloadConfig from '../../payload.config.ts';
import { CAPTAIN_ROLE, DEFAULT_CREW_ROLE } from '@astralpirates/shared/crewRoles';
import { crewProfiles } from './crewProfiles';
import { resolveCaptainInviterId, resolveUserId } from '../utils/invitedBy';

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  let captainInviterId = await resolveCaptainInviterId(payload);

  for (const member of crewProfiles) {
    const { email, firstName, lastName, password, profileSlug } = member;

    const existing = await payload.find({
      collection: 'users',
      where: {
        email: { equals: email },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      const user = existing.docs[0];
      const identityUpdates: Record<string, unknown> = {};
      const existingInviterId = resolveUserId((user as Record<string, unknown>).invitedBy);
      if (!user.firstName && firstName) {
        identityUpdates.firstName = firstName;
      }
      if (!user.lastName && lastName) {
        identityUpdates.lastName = lastName;
      }
      if (member.role !== CAPTAIN_ROLE && existingInviterId == null && captainInviterId != null) {
        identityUpdates.invitedBy = captainInviterId;
      }

      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          ...identityUpdates,
          password,
          role: member.role ?? DEFAULT_CREW_ROLE,
          isTestUser: member.isTestUser,
          accountType: member.accountType,
          callSign: member.callSign,
          pronouns: member.pronouns,
          avatarUrl: member.avatarUrl,
          bio: member.bio,
          profileSlug,
          skills: member.skills,
          links: member.links,
        },
        overrideAccess: true,
      });
      payload.logger.info({ email }, 'Updated test user');
      if (member.role === CAPTAIN_ROLE && captainInviterId == null) {
        captainInviterId = resolveUserId(user.id);
      }
    } else {
      if (member.role !== CAPTAIN_ROLE && captainInviterId == null) {
        throw new Error('No captain account found. Seed a captain before creating non-captain test users.');
      }

      await payload.create({
        collection: 'users',
        data: {
          email,
          firstName,
          lastName,
          password,
          role: member.role ?? DEFAULT_CREW_ROLE,
          isTestUser: member.isTestUser,
          accountType: member.accountType,
          callSign: member.callSign,
          pronouns: member.pronouns,
          avatarUrl: member.avatarUrl,
          bio: member.bio,
          profileSlug,
          skills: member.skills,
          links: member.links,
          invitedBy: member.role === CAPTAIN_ROLE ? undefined : captainInviterId ?? undefined,
        },
        draft: false,
        overrideAccess: true,
      });
      payload.logger.info({ email }, 'Created test user');
      if (member.role === CAPTAIN_ROLE && captainInviterId == null) {
        const captain = await payload.find({
          collection: 'users',
          where: {
            email: {
              equals: email,
            },
          },
          limit: 1,
          overrideAccess: true,
          depth: 0,
        });
        captainInviterId = resolveUserId(captain.docs[0]?.id);
      }
    }
  }

  payload.logger.info('Test crew accounts ready.');
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
