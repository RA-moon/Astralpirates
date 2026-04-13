import payload from 'payload';
import payloadConfig from '../../payload.config.ts';
import { DEFAULT_CREW_ROLE } from '@astralpirates/shared/crewRoles';
import type { User } from '../../payload-types';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { resolveCaptainInviterId } from '../utils/invitedBy';

type CliOptions = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
};

type ParsedArgs = Partial<CliOptions> & {
  helpRequested?: boolean;
};

const printUsage = (): void => {
  console.log(`Usage: pnpm tsx ./src/scripts/addCrewMember.ts --email <email> --first-name <first name> --last-name <surname> --password <password>

Required flags:
  --email, -e       Crew member email (must be unique)
  --first-name, -f  Crew member first name (immutable after creation)
  --last-name, -l   Crew member surname (immutable after creation)
  --password, -p    Initial password

The new account is provisioned with the default crew role (${DEFAULT_CREW_ROLE}).
`);
};

const parseArgs = (): CliOptions => {
  const rawArgs = process.argv.slice(2);
  const parsed: ParsedArgs = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    switch (arg) {
      case '--email':
      case '-e':
        parsed.email = rawArgs[index + 1];
        index += 1;
        break;
      case '--first-name':
      case '-f':
      case '--name':
      case '-n':
        parsed.firstName = rawArgs[index + 1];
        index += 1;
        break;
      case '--last-name':
      case '-l':
        parsed.lastName = rawArgs[index + 1];
        index += 1;
        break;
      case '--password':
      case '-p':
        parsed.password = rawArgs[index + 1];
        index += 1;
        break;
      case '--help':
      case '-h':
        parsed.helpRequested = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        parsed.helpRequested = true;
        break;
    }
  }

  if (parsed.helpRequested) {
    printUsage();
    process.exit(parsed.helpRequested ? 0 : 1);
  }

  const missing: Array<keyof CliOptions> = [];
  if (!parsed.email) missing.push('email');
  if (!parsed.firstName) missing.push('first-name');
  if (!parsed.lastName) missing.push('last-name');
  if (!parsed.password) missing.push('password');

  if (missing.length > 0) {
    console.error(`Missing required flag(s): ${missing.join(', ')}`);
    printUsage();
    process.exit(1);
  }

  return {
    email: parsed.email!,
    firstName: parsed.firstName!,
    lastName: parsed.lastName!,
    password: parsed.password!,
  };
};

const normaliseEmail = (value: string): string => value.trim().toLowerCase();

const addCrewMember = async ({ email, firstName, lastName, password }: CliOptions): Promise<User> => {
  const payloadInstance = await payload.init({
    config: payloadConfig,
  });

  try {
    const inviterId = await resolveCaptainInviterId(payloadInstance);
    if (DEFAULT_CREW_ROLE !== 'captain' && inviterId == null) {
      throw new Error('No captain account found. Create a captain first before adding non-captain crew members.');
    }

    const existing = await payloadInstance.find({
      collection: 'users',
      where: {
        email: {
          equals: email,
        },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      const doc = existing.docs[0];
      throw new Error(
        `A crew member with email "${email}" already exists (id: ${doc.id}). Aborting to avoid overwriting.`,
      );
    }

    const created = await payloadInstance.create({
      collection: 'users',
      data: {
        email,
        firstName,
        lastName,
        password,
        role: DEFAULT_CREW_ROLE,
        invitedBy: inviterId ?? undefined,
      },
      overrideAccess: true,
    });

    return created;
  } finally {
    await closePayloadLifecycle(payloadInstance);
  }
};

const main = async (): Promise<void> => {
  try {
    const args = parseArgs();
    const normalisedEmail = normaliseEmail(args.email);
    const user = await addCrewMember({ ...args, email: normalisedEmail });
    const crewRole = user.role ?? DEFAULT_CREW_ROLE;
    console.log(
      JSON.stringify(
        {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: crewRole,
          message: `Crew member created with role ${crewRole}. Neo4j sync will run via Payload hooks.`,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const err = error as Error;
    console.error(err.message);
    process.exitCode = 1;
  }
};

void main();
