# Astral Pirates CMS

Payload 3 (`3.78.x`) running inside Next.js 15.

## Stack
- Payload `3.78.x`
- Next.js `15.5.x`
- PostgreSQL
- Neo4j
- Redis/BullMQ workers

## Prerequisites
- Node.js `>=20.19.0`
- pnpm `10.20.0`
- Docker (recommended for full local stack)

## Environment
CMS/frontend env loading is centralized in `shared/env.ts` (`config/loadEnv.ts`, `config/envSchema.ts`).

Use repo-root templates:
- `.env.example`
- `.env.shared.example`
- `.env.deploy.example`

Required in production:
- `PAYLOAD_SECRET`
- `PAYLOAD_PUBLIC_SERVER_URL`
- `DATABASE_URL`
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- `REGISTER_LINK_BASE`
- `FRONTEND_ORIGIN`

SMTP:
- Set `SMTP_HOST`, user, password, and sender (`EMAIL_FROM_*` / `SMTP_FROM_*`) for invites/password resets.

Media storage:
- `MEDIA_STORAGE_PROVIDER=local` (default) or `seaweedfs`.
- SeaweedFS requires `MEDIA_BASE_URL`, S3 endpoint/credentials, and bucket vars.

## Local development
### Docker-first (recommended)
From repo root:
```bash
pnpm install
pnpm docker:up
pnpm cms:seed
```

### Native CMS only
From `cms/`:
```bash
pnpm install
pnpm payload migrate -- --config ./payload.config.ts
pnpm seed
pnpm dev
```

## Build and start
From `cms/`:
```bash
pnpm build
pnpm start
```

## Common scripts
From repo root:
- `pnpm --dir cms lint`
- `pnpm --dir cms typecheck`
- `pnpm --dir cms test`
- `pnpm --dir cms db:check:local`
- `pnpm --dir cms access:backfill:local`
- `pnpm --dir cms tasks:backfill -- --slug <flight-plan-slug>`
- `pnpm --dir cms messaging:rotate-keys --from <old> --to <new>`

Root-level Docker one-offs:
- `pnpm cms:db-check:docker`
- `pnpm cms:access-backfill:docker`
- `pnpm cms:access-backfill:docker:with-migrate`

## API health checks
- `/api/pages/health`
- `/api/profiles/health`

## Related docs
- `docs/project-overview.md`
- `docs/architecture/backend-overview.md`
- `docs/how-to-run.md`
- `docs/release-checklist.md`
