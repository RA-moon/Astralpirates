import {
  resolveScriptRunProfile,
  runDatabasePreflight,
} from '@/src/scripts/_lib/dbPreflight.ts';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const hasFlag = (flag: string) => args.includes(flag);
  return {
    skipConnectivityCheck: hasFlag('--skip-connect'),
  };
};

const main = async () => {
  const { skipConnectivityCheck } = parseArgs();
  const runProfile = resolveScriptRunProfile();
  process.env.NODE_ENV = process.env.NODE_ENV ?? (runProfile === 'prod' ? 'production' : 'development');

  const result = await runDatabasePreflight({
    runProfile,
    scriptName: 'db-check',
    skipConnectivityCheck,
  });

  result.warnings.forEach((warning) => {
    // eslint-disable-next-line no-console
    console.warn(warning);
  });

  // eslint-disable-next-line no-console
  console.info(
    `[db-check] OK target=${result.target.host}:${result.target.port}/${result.target.database} profile=${result.runProfile} runtime=${result.runtime} connectivity=${skipConnectivityCheck ? 'skipped' : 'verified'}`,
  );
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[db-check] failed', error);
  process.exit(1);
});
