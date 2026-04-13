import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import sharp from 'sharp';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type StreamTransport from 'nodemailer/lib/stream-transport';
import { buildConfig, databaseKVAdapter, type EmailAdapter, type SharpDependency } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildGalleryCanonicalModeStartupWarning } from '@astralpirates/shared/mediaUrls';
import { resolveCmsEnv } from './config/envSchema.ts';
const { loadDefaultEnvOrder } = await import('./config/loadEnv.ts');

import Users from './src/collections/Users.ts';
import Pages from './src/collections/Pages.ts';
import FlightPlans from './src/collections/FlightPlans.ts';
import FlightPlanSeries from './src/collections/FlightPlanSeries.ts';
import FlightPlanStatusEvents from './src/collections/FlightPlanStatusEvents.ts';
import FlightPlanMemberships from './src/collections/FlightPlanMemberships.ts';
import FlightPlanMembershipEvents from './src/collections/FlightPlanMembershipEvents.ts';
import FlightPlanTasks from './src/collections/FlightPlanTasks.ts';
import TaskAttachments from './src/collections/TaskAttachments.ts';
import Logs from './src/collections/Logs.ts';
import RegistrationTokens from './src/collections/RegistrationTokens.ts';
import InviteRequests from './src/collections/InviteRequests.ts';
import Avatars from './src/collections/Avatars.ts';
import GalleryImages from './src/collections/GalleryImages.ts';
import HonorBadgeMedia from './src/collections/HonorBadgeMedia.ts';
import NavigationNodes from './src/collections/NavigationNodes.ts';
import Notifications from './src/collections/Notifications.ts';
import RoadmapTiers from './src/collections/RoadmapTiers.ts';
import Plans from './src/collections/Plans.ts';
import MatrixFlightPlanMutes from './src/collections/MatrixFlightPlanMutes.ts';
import { buildMediaStoragePlugins } from './src/storage/mediaStorage.ts';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

loadDefaultEnvOrder(path.resolve(dirname, '..'), dirname);

const shouldPushDbSchema = (() => {
  const raw = process.env.PAYLOAD_DB_PUSH;
  if (typeof raw === 'string') {
    const normalised = raw.trim().toLowerCase();
    if (normalised === 'true') return true;
    if (normalised === 'false') return false;
  }
  return process.env.NODE_ENV !== 'production';
})();

const sharpDependency: SharpDependency = (input, options) => (sharp(input as any, options) as unknown as ReturnType<SharpDependency>);

const pickEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const cmsEnv = resolveCmsEnv();
const mediaStoragePlugins = buildMediaStoragePlugins(cmsEnv);
const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'cms',
  'frontend',
  'astralpirates-cms-dev',
  'astralpirates-frontend',
  'host.docker.internal',
]);

const isLocalUrl = (value: string | undefined | null): boolean => {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
};

const canUsePreviewEmailTransport = () =>
  process.env.NODE_ENV !== 'production' &&
  isLocalUrl(cmsEnv.payloadServerUrl) &&
  isLocalUrl(cmsEnv.frontendOrigin);

const requireEnv = (value: string | undefined, name: string): string => {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  throw new Error(`[env] ${name} must be set. See cms/.env.example for guidance.`);
};

const resolveTransportOptions = (): SMTPTransport.Options | StreamTransport.Options => {
  const smtpHost = cmsEnv.smtp.host;
  if (smtpHost) {
    const smtpUser = cmsEnv.smtp.user;
    const smtpPassword = cmsEnv.smtp.password;
    const options: SMTPTransport.Options = {
      host: smtpHost,
      port: cmsEnv.smtp.port ?? Number(process.env.SMTP_PORT ?? 587),
      secure: cmsEnv.smtp.secure ?? process.env.SMTP_SECURE === 'true',
      auth:
        smtpUser && smtpPassword
          ? {
              user: smtpUser,
              pass: smtpPassword,
            }
          : undefined,
    };

    const smtpName = pickEnv('SMTP_NAME');
    if (smtpName) {
      options.name = smtpName;
    }

    if (process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false') {
      options.tls = { rejectUnauthorized: false };
    }

    if (process.env.SMTP_IGNORE_TLS === 'true') {
      options.ignoreTLS = true;
    }

    return options;
  }

  if (!canUsePreviewEmailTransport()) {
    throw new Error(
      '[email] SMTP_HOST is required outside local development. Configure SMTP_HOST with SMTP_USER/SMTP_PASSWORD (or SMTP_USERNAME/SMTP_PASS).',
    );
  }

  return {
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  };
};

const emailAdapter: EmailAdapter = ({ payload }) => {
  const fromAddress =
    cmsEnv.smtp.fromAddress ??
    pickEnv('SMTP_FROM') ??
    'noreply@astralpirates.com';
  const fromName =
    cmsEnv.smtp.fromName ??
    pickEnv('SMTP_FROM_NAME') ??
    'Astralpirates';
  const transportOptions = resolveTransportOptions();
  const transporter = nodemailer.createTransport(transportOptions);
  const usingStreamTransport = 'streamTransport' in transportOptions;

  return {
    name: 'nodemailer',
    defaultFromAddress: fromAddress,
    defaultFromName: fromName,
    sendEmail: async (message) => {
      const finalMessage = {
        ...message,
        from: message.from ?? `${fromName} <${fromAddress}>`,
      } satisfies SendMailOptions;

      const info = await transporter.sendMail(finalMessage);

      if (usingStreamTransport && 'message' in info) {
        const raw = (info as unknown as { message?: unknown }).message;
        const preview =
          typeof raw === 'string'
            ? raw
            : Buffer.isBuffer(raw)
              ? raw.toString()
              : raw != null
                ? String(raw)
                : undefined;
        if (preview) {
          payload.logger.info({ emailPreview: preview }, 'Captured email via stream transport');
        }
      }

      return info;
    },
  };
};

const payloadServerURL = cmsEnv.payloadServerUrl;
const payloadSecret = requireEnv(cmsEnv.payloadSecret, 'PAYLOAD_SECRET');
const databaseUrl = requireEnv(cmsEnv.databaseUrl, 'DATABASE_URL');
const frontendOrigin = cmsEnv.frontendOrigin;
const galleryCanonicalModeWarning = buildGalleryCanonicalModeStartupWarning({
  mediaProvider: cmsEnv.media.provider,
  mediaBaseUrl: cmsEnv.media.baseUrl,
  payloadServerUrl: payloadServerURL,
});

const normaliseOrigin = (value: string | undefined | null): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const addOriginWithAlias = (origins: Set<string>, value: string | undefined | null) => {
  const origin = normaliseOrigin(value);
  if (!origin) return;
  origins.add(origin);
  // Include the www/non-www counterpart to keep apex and subdomain in sync.
  const hasWww = origin.includes('://www.');
  const alias = hasWww ? origin.replace('://www.', '://') : origin.replace('://', '://www.');
  origins.add(alias);
};

const resolvedAllowedOrigins = (() => {
  const isProduction = process.env.NODE_ENV === 'production';
  const origins = new Set<string>();
  addOriginWithAlias(origins, payloadServerURL);
  addOriginWithAlias(origins, frontendOrigin);
  if (!isProduction) {
    // Always allow common local ports during development so preview/test servers work.
    const fallbackPorts = new Set<string>([
      String(process.env.NUXT_PORT ?? process.env.FRONTEND_PORT ?? '8080'),
      '3000',
      '3001',
    ]);
    for (const port of fallbackPorts) {
      addOriginWithAlias(origins, `http://localhost:${port}`);
    }
    addOriginWithAlias(origins, 'http://frontend:3001');
    addOriginWithAlias(origins, 'http://astralpirates-frontend:3001');
  }
  // Fallback to localhost for dev if nothing else was added.
  if (!origins.size) {
    addOriginWithAlias(origins, 'http://localhost:8080');
    addOriginWithAlias(origins, 'http://localhost:3000');
    addOriginWithAlias(origins, 'http://localhost:3001');
  }
  return Array.from(origins);
})();

export default buildConfig({
  serverURL: payloadServerURL,
  secret: payloadSecret,
  cors: resolvedAllowedOrigins,
  csrf: resolvedAllowedOrigins,
  onInit: async (payload) => {
    if (!galleryCanonicalModeWarning) return;
    payload.logger.warn(
      {
        mediaProvider: cmsEnv.media.provider,
        mediaBaseUrl: cmsEnv.media.baseUrl,
        payloadServerUrl: payloadServerURL,
      },
      galleryCanonicalModeWarning,
    );
  },
  admin: {
    user: Users.slug,
  },
  email: emailAdapter,
  sharp: sharpDependency,
  kv: databaseKVAdapter(),
  db: postgresAdapter({
    // Allow schema pushes locally unless explicitly disabled; require opt-in in production.
    push: shouldPushDbSchema,
    pool: {
      connectionString: databaseUrl,
    },
  }),
  collections: [
    Users,
    Pages,
    FlightPlans,
    FlightPlanSeries,
    FlightPlanStatusEvents,
    FlightPlanMemberships,
    FlightPlanMembershipEvents,
    FlightPlanTasks,
    Logs,
    RegistrationTokens,
    InviteRequests,
    Avatars,
    GalleryImages,
    HonorBadgeMedia,
    NavigationNodes,
    Notifications,
    TaskAttachments,
    RoadmapTiers,
    Plans,
    MatrixFlightPlanMutes,
  ],
  plugins: mediaStoragePlugins,
});
