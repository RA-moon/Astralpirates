import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { z } from 'zod';
import { MEDIA_DEFAULT_BUCKETS } from './mediaUrls';

const MEDIA_STORAGE_PROVIDERS = ['local', 'seaweedfs'] as const;
type MediaStorageProvider = (typeof MEDIA_STORAGE_PROVIDERS)[number];

const MEDIA_ACCESS_LEVELS = ['public', 'private', 'internal'] as const;
type MediaAccessLevel = (typeof MEDIA_ACCESS_LEVELS)[number];

const MEDIA_LIFECYCLE_STATES = ['durable', 'ephemeral', 'quarantine', 'archive'] as const;
type MediaLifecycleState = (typeof MEDIA_LIFECYCLE_STATES)[number];

export type FrontendEnv = {
  astralApiBase: string;
  publicAstralApiBase: string;
  payloadSecret?: string;
};

export type CmsEnv = {
  payloadSecret: string;
  payloadServerUrl: string;
  databaseUrl: string;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  registerLinkBase: string;
  frontendOrigin: string;
  smtp: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    fromName?: string;
    fromAddress?: string;
  };
  messaging: {
    masterKey?: string;
  };
  media: {
    provider: MediaStorageProvider;
    baseUrl: string;
    s3: {
      endpoint?: string;
      region: string;
      forcePathStyle: boolean;
      accessKeyId?: string;
      secretAccessKey?: string;
    };
    buckets: {
      avatars: string;
      gallery: string;
      tasks: string;
      badges: string;
      matrix: string;
      videos: string;
      models: string;
      documents: string;
    };
    defaults: {
      access: MediaAccessLevel;
      lifecycle: MediaLifecycleState;
      retentionPolicy: string;
      signedUrlTtlSeconds: number;
      enforceScan: boolean;
      requireQuarantineOnScanFailure: boolean;
    };
    limits: {
      maxUploadBytes: {
        avatar: number;
        gallery: number;
        taskAttachment: number;
        badge: number;
      };
      quotasBytes: {
        userDaily: number;
        flightPlan: number;
      };
    };
  };
};

export type ResolveFrontendEnvOptions = {
  env?: NodeJS.ProcessEnv;
  nodeEnv?: string;
  enforceStrict?: boolean;
};

export type ResolveCmsEnvOptions = {
  env?: NodeJS.ProcessEnv;
  nodeEnv?: string;
};

export type LoadEnvFileOptions = {
  paths: string[];
  override?: boolean;
};

const normalizeOptionalString = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const normalizeOptionalNumber = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}, z.number().optional());

const normalizeOptionalBoolean = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
}, z.boolean().optional());

const asPositiveInteger = (value: number | undefined, fallback: number): number => {
  const normalized = value != null ? Math.floor(value) : fallback;
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
};

const normaliseChoice = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
};

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, { message: 'must be a valid URL' });

const optionalUrl = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  urlSchema.optional(),
);

const formatIssues = (issues: z.ZodIssue[]) =>
  issues
    .map((issue) => {
      const path = issue.path.join('.') || 'environment';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

const buildFrontendSchema = (enforceStrict: boolean) =>
  z
    .object({
      ASTRAL_API_BASE: optionalUrl,
      NUXT_PUBLIC_ASTRAL_API_BASE: optionalUrl,
      PAYLOAD_SECRET: normalizeOptionalString,
    })
    .superRefine((data, ctx) => {
      if (enforceStrict && !data.ASTRAL_API_BASE && !data.NUXT_PUBLIC_ASTRAL_API_BASE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ASTRAL_API_BASE'],
          message: 'must be defined in production (directly or via NUXT_PUBLIC_ASTRAL_API_BASE)',
        });
      }
    });

const normalizeOptionalHexKey = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'must be a 32-byte hex string')
  .optional());

const buildCmsSchema = (isProduction: boolean) =>
  z
    .object({
      PAYLOAD_SECRET: normalizeOptionalString,
      PAYLOAD_PUBLIC_SERVER_URL: optionalUrl,
      DATABASE_URL: normalizeOptionalString,
      NEO4J_URI: optionalUrl,
      NEO4J_USER: normalizeOptionalString,
      NEO4J_PASSWORD: normalizeOptionalString,
      REGISTER_LINK_BASE: optionalUrl,
      FRONTEND_ORIGIN: optionalUrl,
      SMTP_HOST: normalizeOptionalString,
      SMTP_PORT: normalizeOptionalNumber,
      SMTP_SECURE: normalizeOptionalBoolean,
      SMTP_USER: normalizeOptionalString,
      SMTP_USERNAME: normalizeOptionalString,
      SMTP_PASSWORD: normalizeOptionalString,
      SMTP_PASS: normalizeOptionalString,
      EMAIL_FROM_NAME: normalizeOptionalString,
      EMAIL_FROM_ADDRESS: normalizeOptionalString,
      MESSAGING_MASTER_KEY: normalizeOptionalHexKey,
      MEDIA_STORAGE_PROVIDER: normalizeOptionalString,
      MEDIA_BASE_URL: optionalUrl,
      MEDIA_S3_ENDPOINT: optionalUrl,
      MEDIA_S3_REGION: normalizeOptionalString,
      MEDIA_S3_FORCE_PATH_STYLE: normalizeOptionalBoolean,
      MEDIA_S3_ACCESS_KEY_ID: normalizeOptionalString,
      MEDIA_S3_SECRET_ACCESS_KEY: normalizeOptionalString,
      MEDIA_BUCKET_AVATARS: normalizeOptionalString,
      MEDIA_BUCKET_GALLERY: normalizeOptionalString,
      MEDIA_BUCKET_TASKS: normalizeOptionalString,
      MEDIA_BUCKET_BADGES: normalizeOptionalString,
      MEDIA_BUCKET_MATRIX: normalizeOptionalString,
      MEDIA_BUCKET_VIDEOS: normalizeOptionalString,
      MEDIA_BUCKET_MODELS: normalizeOptionalString,
      MEDIA_BUCKET_DOCUMENTS: normalizeOptionalString,
      MEDIA_DEFAULT_ACCESS: normalizeOptionalString,
      MEDIA_DEFAULT_LIFECYCLE: normalizeOptionalString,
      MEDIA_DEFAULT_RETENTION_POLICY: normalizeOptionalString,
      MEDIA_SIGNED_URL_TTL_SECONDS: normalizeOptionalNumber,
      MEDIA_ENFORCE_SCAN: normalizeOptionalBoolean,
      MEDIA_REQUIRE_QUARANTINE: normalizeOptionalBoolean,
      MEDIA_MAX_UPLOAD_AVATAR_BYTES: normalizeOptionalNumber,
      MEDIA_MAX_UPLOAD_GALLERY_BYTES: normalizeOptionalNumber,
      MEDIA_MAX_UPLOAD_TASK_BYTES: normalizeOptionalNumber,
      MEDIA_MAX_UPLOAD_BADGE_BYTES: normalizeOptionalNumber,
      MEDIA_QUOTA_USER_DAILY_BYTES: normalizeOptionalNumber,
      MEDIA_QUOTA_FLIGHTPLAN_BYTES: normalizeOptionalNumber,
    })
    .superRefine((data, ctx) => {
      const missingKeys: Array<[keyof typeof data, string]> = [];
      const smtpUser = data.SMTP_USER ?? data.SMTP_USERNAME;
      const smtpPassword = data.SMTP_PASSWORD ?? data.SMTP_PASS;
      if (isProduction) {
        ([
          ['PAYLOAD_SECRET', 'must be set'],
          ['PAYLOAD_PUBLIC_SERVER_URL', 'must be a valid URL'],
          ['DATABASE_URL', 'must be set'],
          ['NEO4J_URI', 'must be set'],
          ['NEO4J_USER', 'must be set'],
          ['NEO4J_PASSWORD', 'must be set'],
          ['REGISTER_LINK_BASE', 'must be a valid URL'],
          ['FRONTEND_ORIGIN', 'must be a valid URL'],
        ] as const).forEach(([key, message]) => {
          if (!data[key]) {
            missingKeys.push([key, message]);
          }
        });

        if (!data.SMTP_HOST) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_HOST'],
            message: 'must be defined in production for invitation/password-reset emails',
          });
        }
        if (!smtpUser) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_USER'],
            message: 'must be defined in production (SMTP_USER or SMTP_USERNAME)',
          });
        }
        if (!smtpPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_PASSWORD'],
            message: 'must be defined in production (SMTP_PASSWORD or SMTP_PASS)',
          });
        }
      }

      missingKeys.forEach(([key, message]) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message,
        });
      });

      if (data.SMTP_HOST) {
        if (!smtpUser) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_USER'],
            message: 'must be defined when SMTP_HOST is provided',
          });
        }
        if (!smtpPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_PASSWORD'],
            message: 'must be defined when SMTP_HOST is provided',
          });
        }
      }

      const mediaProvider = (data.MEDIA_STORAGE_PROVIDER ?? 'local').trim().toLowerCase();
      if (!(MEDIA_STORAGE_PROVIDERS as readonly string[]).includes(mediaProvider)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_STORAGE_PROVIDER'],
          message: `must be one of: ${MEDIA_STORAGE_PROVIDERS.join(', ')}`,
        });
      }

      const mediaDefaultAccess = data.MEDIA_DEFAULT_ACCESS?.trim().toLowerCase();
      if (
        mediaDefaultAccess &&
        !(MEDIA_ACCESS_LEVELS as readonly string[]).includes(mediaDefaultAccess)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_DEFAULT_ACCESS'],
          message: `must be one of: ${MEDIA_ACCESS_LEVELS.join(', ')}`,
        });
      }

      const mediaDefaultLifecycle = data.MEDIA_DEFAULT_LIFECYCLE?.trim().toLowerCase();
      if (
        mediaDefaultLifecycle &&
        !(MEDIA_LIFECYCLE_STATES as readonly string[]).includes(mediaDefaultLifecycle)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_DEFAULT_LIFECYCLE'],
          message: `must be one of: ${MEDIA_LIFECYCLE_STATES.join(', ')}`,
        });
      }

      if (mediaProvider === 'seaweedfs') {
        if (!data.MEDIA_S3_ENDPOINT) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_S3_ENDPOINT'],
            message: 'must be defined when MEDIA_STORAGE_PROVIDER=seaweedfs',
          });
        }
        if (!data.MEDIA_S3_ACCESS_KEY_ID) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_S3_ACCESS_KEY_ID'],
            message: 'must be defined when MEDIA_STORAGE_PROVIDER=seaweedfs',
          });
        }
        if (!data.MEDIA_S3_SECRET_ACCESS_KEY) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_S3_SECRET_ACCESS_KEY'],
            message: 'must be defined when MEDIA_STORAGE_PROVIDER=seaweedfs',
          });
        }
        if (
          !data.MEDIA_BUCKET_AVATARS ||
          !data.MEDIA_BUCKET_GALLERY ||
          !data.MEDIA_BUCKET_TASKS ||
          !data.MEDIA_BUCKET_BADGES
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_BUCKET_AVATARS'],
            message:
              'MEDIA_BUCKET_AVATARS, MEDIA_BUCKET_GALLERY, MEDIA_BUCKET_TASKS, and MEDIA_BUCKET_BADGES must be defined when MEDIA_STORAGE_PROVIDER=seaweedfs',
          });
        }
        if (isProduction && !data.MEDIA_BASE_URL) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_BASE_URL'],
            message: 'must be a valid URL in production when MEDIA_STORAGE_PROVIDER=seaweedfs',
          });
        }
      }

      const positiveNumberFields: Array<[keyof typeof data, string]> = [
        ['MEDIA_SIGNED_URL_TTL_SECONDS', 'must be greater than 0 when provided'],
        ['MEDIA_MAX_UPLOAD_AVATAR_BYTES', 'must be greater than 0 when provided'],
        ['MEDIA_MAX_UPLOAD_GALLERY_BYTES', 'must be greater than 0 when provided'],
        ['MEDIA_MAX_UPLOAD_TASK_BYTES', 'must be greater than 0 when provided'],
        ['MEDIA_MAX_UPLOAD_BADGE_BYTES', 'must be greater than 0 when provided'],
        ['MEDIA_QUOTA_USER_DAILY_BYTES', 'must be greater than 0 when provided'],
        ['MEDIA_QUOTA_FLIGHTPLAN_BYTES', 'must be greater than 0 when provided'],
      ];

      positiveNumberFields.forEach(([key, message]) => {
        const value = data[key];
        if (typeof value === 'number' && value <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message,
          });
        }
      });
    });

export const resolveFrontendEnv = (options: ResolveFrontendEnvOptions = {}): FrontendEnv => {
  const env = options.env ?? process.env;
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const defaultStrict = isProduction && env.NUXT_VALIDATE_PROD !== 'false';
  const enforceStrict = options.enforceStrict ?? defaultStrict;
  const schema = buildFrontendSchema(enforceStrict);
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`[env] Invalid frontend configuration: ${formatIssues(parsed.error.issues)}`);
  }

  const { ASTRAL_API_BASE, NUXT_PUBLIC_ASTRAL_API_BASE, PAYLOAD_SECRET } = parsed.data;
  const fallbackApiBase = 'http://localhost:3000';

  const astralApiBase = ASTRAL_API_BASE ?? NUXT_PUBLIC_ASTRAL_API_BASE ?? fallbackApiBase;
  const publicAstralApiBase = NUXT_PUBLIC_ASTRAL_API_BASE ?? ASTRAL_API_BASE ?? fallbackApiBase;

  if (enforceStrict) {
    [astralApiBase, publicAstralApiBase].forEach((value, index) => {
      const label = index === 0 ? 'ASTRAL_API_BASE' : 'NUXT_PUBLIC_ASTRAL_API_BASE';
      const url = new URL(value);
      if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
        throw new Error(`[env] ${label} cannot point at localhost in production (received ${value}).`);
      }
    });
  }

  return {
    astralApiBase,
    publicAstralApiBase,
    payloadSecret: PAYLOAD_SECRET,
  };
};

const pickEnv = (key: string) => {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const resolveCmsEnv = (options: ResolveCmsEnvOptions = {}): CmsEnv => {
  const env = options.env ?? process.env;
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const schema = buildCmsSchema(isProduction);
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`[env] Invalid CMS configuration: ${formatIssues(parsed.error.issues)}`);
  }

  const {
    PAYLOAD_SECRET,
    DATABASE_URL,
    NEO4J_URI,
    NEO4J_USER,
    NEO4J_PASSWORD,
    REGISTER_LINK_BASE,
    PAYLOAD_PUBLIC_SERVER_URL,
    FRONTEND_ORIGIN,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_PASS,
    EMAIL_FROM_NAME,
    EMAIL_FROM_ADDRESS,
    MESSAGING_MASTER_KEY,
    MEDIA_STORAGE_PROVIDER,
    MEDIA_BASE_URL,
    MEDIA_S3_ENDPOINT,
    MEDIA_S3_REGION,
    MEDIA_S3_FORCE_PATH_STYLE,
    MEDIA_S3_ACCESS_KEY_ID,
    MEDIA_S3_SECRET_ACCESS_KEY,
    MEDIA_BUCKET_AVATARS,
    MEDIA_BUCKET_GALLERY,
    MEDIA_BUCKET_TASKS,
    MEDIA_BUCKET_BADGES,
    MEDIA_BUCKET_MATRIX,
    MEDIA_BUCKET_VIDEOS,
    MEDIA_BUCKET_MODELS,
    MEDIA_BUCKET_DOCUMENTS,
    MEDIA_DEFAULT_ACCESS,
    MEDIA_DEFAULT_LIFECYCLE,
    MEDIA_DEFAULT_RETENTION_POLICY,
    MEDIA_SIGNED_URL_TTL_SECONDS,
    MEDIA_ENFORCE_SCAN,
    MEDIA_REQUIRE_QUARANTINE,
    MEDIA_MAX_UPLOAD_AVATAR_BYTES,
    MEDIA_MAX_UPLOAD_GALLERY_BYTES,
    MEDIA_MAX_UPLOAD_TASK_BYTES,
    MEDIA_MAX_UPLOAD_BADGE_BYTES,
    MEDIA_QUOTA_USER_DAILY_BYTES,
    MEDIA_QUOTA_FLIGHTPLAN_BYTES,
  } = parsed.data;

  const defaultFrontendOrigin = 'http://localhost:8080';
  const defaultPayloadServerUrl = 'http://localhost:3000';
  const frontendOriginSource = FRONTEND_ORIGIN ?? defaultFrontendOrigin;
  const frontendUrl = new URL(frontendOriginSource);
  const frontendOrigin = `${frontendUrl.protocol}//${frontendUrl.host}`;
  const registerLinkBase = REGISTER_LINK_BASE ?? `${frontendUrl.origin.replace(/\/+$/, '')}/enlist/accept`;
  const payloadServerUrl = PAYLOAD_PUBLIC_SERVER_URL ?? defaultPayloadServerUrl;

  if (isProduction) {
    ([
      ['FRONTEND_ORIGIN', frontendOrigin],
      ['REGISTER_LINK_BASE', registerLinkBase],
      ['PAYLOAD_PUBLIC_SERVER_URL', payloadServerUrl],
    ] as const).forEach(([label, value]) => {
      const url = new URL(value);
      if (!url.protocol.startsWith('http')) {
        throw new Error(`[env] ${label} must use http or https (received ${value}).`);
      }
    });
  }

  const smtpUser = SMTP_USER ?? SMTP_USERNAME ?? undefined;
  const smtpPassword = SMTP_PASSWORD ?? SMTP_PASS ?? undefined;
  const mediaProvider = normaliseChoice(MEDIA_STORAGE_PROVIDER, MEDIA_STORAGE_PROVIDERS, 'local');
  const mediaBaseUrl = MEDIA_BASE_URL ?? `${payloadServerUrl.replace(/\/+$/, '')}/media`;
  const mediaDefaultAccess = normaliseChoice(MEDIA_DEFAULT_ACCESS, MEDIA_ACCESS_LEVELS, 'public');
  const mediaDefaultLifecycle = normaliseChoice(
    MEDIA_DEFAULT_LIFECYCLE,
    MEDIA_LIFECYCLE_STATES,
    'durable',
  );

  return {
    payloadSecret: PAYLOAD_SECRET ?? '',
    payloadServerUrl,
    databaseUrl: DATABASE_URL ?? '',
    neo4jUri: NEO4J_URI ?? 'bolt://localhost:7687',
    neo4jUser: NEO4J_USER ?? 'neo4j',
    neo4jPassword: NEO4J_PASSWORD ?? 'neo4j',
    registerLinkBase,
    frontendOrigin,
    smtp: {
      host: SMTP_HOST ?? undefined,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      user: smtpUser,
      password: smtpPassword,
      fromName: EMAIL_FROM_NAME ?? undefined,
      fromAddress: EMAIL_FROM_ADDRESS ?? undefined,
    },
    messaging: {
      masterKey: MESSAGING_MASTER_KEY,
    },
    media: {
      provider: mediaProvider,
      baseUrl: mediaBaseUrl,
      s3: {
        endpoint: MEDIA_S3_ENDPOINT ?? undefined,
        region: MEDIA_S3_REGION ?? 'us-east-1',
        forcePathStyle: MEDIA_S3_FORCE_PATH_STYLE ?? true,
        accessKeyId: MEDIA_S3_ACCESS_KEY_ID ?? undefined,
        secretAccessKey: MEDIA_S3_SECRET_ACCESS_KEY ?? undefined,
      },
      buckets: {
        avatars: MEDIA_BUCKET_AVATARS ?? MEDIA_DEFAULT_BUCKETS.avatars,
        gallery: MEDIA_BUCKET_GALLERY ?? MEDIA_DEFAULT_BUCKETS.gallery,
        tasks: MEDIA_BUCKET_TASKS ?? MEDIA_DEFAULT_BUCKETS.tasks,
        badges: MEDIA_BUCKET_BADGES ?? MEDIA_DEFAULT_BUCKETS.badges,
        matrix: MEDIA_BUCKET_MATRIX ?? MEDIA_DEFAULT_BUCKETS.matrix,
        videos: MEDIA_BUCKET_VIDEOS ?? MEDIA_DEFAULT_BUCKETS.videos,
        models: MEDIA_BUCKET_MODELS ?? MEDIA_DEFAULT_BUCKETS.models,
        documents: MEDIA_BUCKET_DOCUMENTS ?? MEDIA_DEFAULT_BUCKETS.documents,
      },
      defaults: {
        access: mediaDefaultAccess,
        lifecycle: mediaDefaultLifecycle,
        retentionPolicy: MEDIA_DEFAULT_RETENTION_POLICY ?? 'rp-forever',
        signedUrlTtlSeconds: asPositiveInteger(MEDIA_SIGNED_URL_TTL_SECONDS, 300),
        enforceScan: MEDIA_ENFORCE_SCAN ?? true,
        requireQuarantineOnScanFailure: MEDIA_REQUIRE_QUARANTINE ?? true,
      },
      limits: {
        maxUploadBytes: {
          avatar: asPositiveInteger(MEDIA_MAX_UPLOAD_AVATAR_BYTES, 2 * 1024 * 1024),
          gallery: asPositiveInteger(MEDIA_MAX_UPLOAD_GALLERY_BYTES, 25 * 1024 * 1024),
          taskAttachment: asPositiveInteger(MEDIA_MAX_UPLOAD_TASK_BYTES, 25 * 1024 * 1024),
          badge: asPositiveInteger(MEDIA_MAX_UPLOAD_BADGE_BYTES, 2 * 1024 * 1024),
        },
        quotasBytes: {
          userDaily: asPositiveInteger(MEDIA_QUOTA_USER_DAILY_BYTES, 200 * 1024 * 1024),
          flightPlan: asPositiveInteger(MEDIA_QUOTA_FLIGHTPLAN_BYTES, 2 * 1024 * 1024 * 1024),
        },
      },
    },
  };
};

const parsedCache = new Set<string>();

const parseLine = (line: string): [string, string] | null => {
  if (!line || line.trim().startsWith('#')) return null;
  const separatorIndex = line.indexOf('=');
  if (separatorIndex === -1) return null;
  const key = line.slice(0, separatorIndex).trim();
  if (!key) return null;
  const rawValue = line.slice(separatorIndex + 1).trim();
  const value =
    rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue.startsWith("'") && rawValue.endsWith("'")
        ? rawValue.slice(1, -1)
        : rawValue;
  return [key, value];
};

const applyEnv = (entries: Array<[string, string]>, override: boolean) => {
  entries.forEach(([key, value]) => {
    if (override || typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  });
};

export const loadEnvFiles = ({ paths, override = false }: LoadEnvFileOptions) => {
  paths.forEach((envPath) => {
    const resolved = path.resolve(envPath);
    if (parsedCache.has(resolved)) return;
    if (!fs.existsSync(resolved)) return;

    const contents = fs.readFileSync(resolved, 'utf8');
    const entries: Array<[string, string]> = [];
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .forEach((line) => {
        const parsed = parseLine(line);
        if (parsed) entries.push(parsed);
      });

    applyEnv(entries, override);
    parsedCache.add(resolved);
  });
};

export const loadDefaultEnvOrder = (baseDir: string, packageDir?: string) => {
  const paths = [];
  paths.push(path.join(baseDir, '.env.local'));
  paths.push(path.join(baseDir, '.env.shared'));
  paths.push(path.join(baseDir, '.env'));

  if (packageDir) {
    paths.push(path.join(packageDir, '.env.local'));
    paths.push(path.join(packageDir, '.env'));
  }

  loadEnvFiles({ paths });
};
