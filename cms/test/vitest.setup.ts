const setDefaultEnv = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

const forceEnv = (key: string, value: string) => {
  process.env[key] = value;
};

const clearEnv = (key: string) => {
  delete process.env[key];
};

setDefaultEnv('PAYLOAD_SECRET', 'test_payload_secret');
setDefaultEnv('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/astralpirates_test');
setDefaultEnv('PAYLOAD_PUBLIC_SERVER_URL', 'http://localhost:3000');
setDefaultEnv('FRONTEND_ORIGIN', 'http://localhost:8080');

// Keep CMS tests hermetic even if the caller shell exports SeaweedFS variables.
forceEnv('MEDIA_STORAGE_PROVIDER', 'local');
for (const key of [
  'MEDIA_S3_ENDPOINT',
  'MEDIA_S3_REGION',
  'MEDIA_S3_FORCE_PATH_STYLE',
  'MEDIA_S3_ACCESS_KEY_ID',
  'MEDIA_S3_SECRET_ACCESS_KEY',
]) {
  clearEnv(key);
}
