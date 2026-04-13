# Astral Pirates Frontend

Nuxt 4 application for the public site (`astralpirates.com`).

## Stack
- Nuxt `4.3.x`
- Vue `3.5.x`
- Pinia `3.x`
- Vitest + Playwright

## Prerequisites
- Node.js `>=20.19.0`
- pnpm `10.20.0` (`corepack use pnpm@10.20.0`)

## Environment
Frontend and CMS env loading is shared via `shared/env.ts` (`config/loadEnv.ts` + `config/envSchema.ts`).

Use repo-root templates (not workspace-local templates):
- `.env.example`
- `.env.shared.example`
- `.env.deploy.example` (deploy defaults)

Important frontend vars:
- `ASTRAL_API_BASE`
- `NUXT_PUBLIC_ASTRAL_API_BASE`
- `PAYLOAD_SECRET` (frontend-side secret for runtime checks)
- `CLIENT_EVENT_SECRET` (recommended separate from `PAYLOAD_SECRET`)
- `NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED` (default `false`; enables avatar image/video/3D rendering contract)
- `NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED` (default `false`; allows model avatars to replace the background flag mesh)

Local dev fallback:
- If API base vars are unset, Nuxt proxies `/cms-api/**` to `http://localhost:3000`.
- Override proxy target with `NUXT_DEV_CMS_PROXY_TARGET`.

Production guardrails:
- `pnpm --dir frontend generate` runs `scripts/validate-frontend-api-base.mjs`.
- Build fails if bundle API base points to localhost or mismatches env.

## Commands
From repo root:
- `pnpm --dir frontend dev`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`
- `pnpm --dir frontend test:e2e`
- `pnpm --dir frontend generate`
- `pnpm --dir frontend build`

Workspace-wide:
- `pnpm lint:all`
- `pnpm test:all`
- `pnpm build:all`

## Docker workflows
- Start stack: `pnpm docker:up`
- Stop stack: `pnpm docker:down`
- Docker integration lane: `pnpm docker:test`
- Docker Playwright lane: `pnpm docker:e2e`

## Design system surfaces
- Engineering Bay: `/gangway/engineering/bay`
- Demo routes: `/design-system/<demo>`
- Registry: `frontend/app/components/ui/demo/registry.ts`

## Related docs
- `docs/how-to-run.md`
- `docs/local-docker.md`
- `docs/testing.md`
- `docs/ui-design-system.md`
