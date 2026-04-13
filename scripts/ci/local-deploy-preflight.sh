#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

usage() {
  cat <<'EOF'
Usage: scripts/ci/local-deploy-preflight.sh [options]

Runs the local checks that should pass before dispatching a GitHub deploy workflow.
This preflight mirrors CI/deploy prerequisites as closely as possible.

Options:
  --skip-install              Skip dependency installation
  --docker-test               Also run `pnpm docker:test`
  --playwright-e2e            Also run `pnpm docker:e2e` (implies --docker-test)
  --skip-backup-readiness     Skip remote backup freshness + restore-drill readiness gate
                              (also skips runtime env readiness)
  --skip-runtime-env-readiness
                              Skip remote runtime env completeness gate
  --backup-target <user@host> SSH target for backup readiness gate
  --backup-port <number>      SSH port for backup readiness gate (default: 22)
  --backup-ssh-key <path>     SSH key for backup readiness gate (optional)
  --runtime-env-path <path>   Remote runtime env path for readiness gate
                              (default: /opt/astralpirates-cms/.env)
  --backup-max-age-hours <n>  Max allowed age for latest backup artifacts (default: 30)
  --restore-drill-max-age-hours <n>
                              Max allowed age for latest restore-drill log entry (default: 2400)
  --require-grafana-backup    Require Grafana backup artifacts in backup readiness gate
  --allow-local-restore-drill-source
                              Do not require "source=remote" evidence in restore-drill log
  --skip-live-legacy-media-parity
                              Skip live `/media/*` vs `/api/*` parity probe
                              against ASTRAL_API_BASE
  --allow-dirty-git           Allow tracked code-impacting git changes before running checks
  --log-dir <path>            Write logs under this directory
  -h, --help                  Show this help text

Tracked docs/log-only edits (`docs/**`, `deploy-logs/**`, `*.md`, `*.mdx`, `*.txt`, `*.log`)
do not block preflight by default.

Environment defaults (if unset):
  ASTRAL_API_BASE=https://astralpirates.com
  NUXT_PUBLIC_ASTRAL_API_BASE=<ASTRAL_API_BASE>
  FRONTEND_ORIGIN=https://astralpirates.com
  PAYLOAD_PUBLIC_SERVER_URL=<ASTRAL_API_BASE>
  REGISTER_LINK_BASE=<FRONTEND_ORIGIN>/enlist/accept
  RUN_SEED=1
  NUXT_DEVTOOLS=0
  BACKUP_PREFLIGHT_PORT=22
  BACKUP_PREFLIGHT_MAX_BACKUP_AGE_HOURS=30
  BACKUP_PREFLIGHT_MAX_RESTORE_DRILL_AGE_HOURS=2400
  BACKUP_PREFLIGHT_REQUIRE_REMOTE_RESTORE_SOURCE=1
  BACKUP_PREFLIGHT_REQUIRE_GRAFANA=0
  RUNTIME_ENV_PATH=/opt/astralpirates-cms/.env
  LIVE_LEGACY_MEDIA_PARITY_MAX_ATTEMPTS=3
  LIVE_LEGACY_MEDIA_PARITY_INITIAL_BACKOFF_SECONDS=5
  LIVE_LEGACY_MEDIA_PARITY_MAX_BACKOFF_SECONDS=30
EOF
}

SKIP_INSTALL=0
RUN_DOCKER_TEST=0
RUN_PLAYWRIGHT_E2E=0
SKIP_BACKUP_READINESS=0
SKIP_RUNTIME_ENV_READINESS=0
RUN_LIVE_LEGACY_MEDIA_PARITY=1
ALLOW_DIRTY_GIT=0
LOG_DIR=""
BACKUP_PREFLIGHT_TARGET="${BACKUP_PREFLIGHT_TARGET:-}"
BACKUP_PREFLIGHT_PORT="${BACKUP_PREFLIGHT_PORT:-${DEPLOY_PORT:-22}}"
BACKUP_PREFLIGHT_SSH_KEY="${BACKUP_PREFLIGHT_SSH_KEY:-}"
BACKUP_PREFLIGHT_MAX_BACKUP_AGE_HOURS="${BACKUP_PREFLIGHT_MAX_BACKUP_AGE_HOURS:-30}"
BACKUP_PREFLIGHT_MAX_RESTORE_DRILL_AGE_HOURS="${BACKUP_PREFLIGHT_MAX_RESTORE_DRILL_AGE_HOURS:-2400}"
BACKUP_PREFLIGHT_REQUIRE_REMOTE_RESTORE_SOURCE="${BACKUP_PREFLIGHT_REQUIRE_REMOTE_RESTORE_SOURCE:-1}"
BACKUP_PREFLIGHT_REQUIRE_GRAFANA="${BACKUP_PREFLIGHT_REQUIRE_GRAFANA:-0}"
RUNTIME_ENV_PATH="${RUNTIME_ENV_PATH:-/opt/astralpirates-cms/.env}"
LIVE_LEGACY_MEDIA_PARITY_MAX_ATTEMPTS="${LIVE_LEGACY_MEDIA_PARITY_MAX_ATTEMPTS:-3}"
LIVE_LEGACY_MEDIA_PARITY_INITIAL_BACKOFF_SECONDS="${LIVE_LEGACY_MEDIA_PARITY_INITIAL_BACKOFF_SECONDS:-5}"
LIVE_LEGACY_MEDIA_PARITY_MAX_BACKOFF_SECONDS="${LIVE_LEGACY_MEDIA_PARITY_MAX_BACKOFF_SECONDS:-30}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --docker-test)
      RUN_DOCKER_TEST=1
      shift
      ;;
    --playwright-e2e)
      RUN_PLAYWRIGHT_E2E=1
      RUN_DOCKER_TEST=1
      shift
      ;;
    --skip-backup-readiness)
      SKIP_BACKUP_READINESS=1
      SKIP_RUNTIME_ENV_READINESS=1
      shift
      ;;
    --skip-runtime-env-readiness)
      SKIP_RUNTIME_ENV_READINESS=1
      shift
      ;;
    --backup-target)
      BACKUP_PREFLIGHT_TARGET="$2"
      shift 2
      ;;
    --backup-port)
      BACKUP_PREFLIGHT_PORT="$2"
      shift 2
      ;;
    --backup-ssh-key)
      BACKUP_PREFLIGHT_SSH_KEY="$2"
      shift 2
      ;;
    --backup-max-age-hours)
      BACKUP_PREFLIGHT_MAX_BACKUP_AGE_HOURS="$2"
      shift 2
      ;;
    --restore-drill-max-age-hours)
      BACKUP_PREFLIGHT_MAX_RESTORE_DRILL_AGE_HOURS="$2"
      shift 2
      ;;
    --require-grafana-backup)
      BACKUP_PREFLIGHT_REQUIRE_GRAFANA=1
      shift
      ;;
    --allow-local-restore-drill-source)
      BACKUP_PREFLIGHT_REQUIRE_REMOTE_RESTORE_SOURCE=0
      shift
      ;;
    --runtime-env-path)
      RUNTIME_ENV_PATH="$2"
      shift 2
      ;;
    --skip-live-legacy-media-parity)
      RUN_LIVE_LEGACY_MEDIA_PARITY=0
      shift
      ;;
    --allow-dirty-git)
      ALLOW_DIRTY_GIT=1
      shift
      ;;
    --log-dir)
      LOG_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not installed." >&2
  exit 1
fi

is_non_code_git_path() {
  local path="$1"
  case "$path" in
    docs/*|deploy-logs/*|*.md|*.mdx|*.log|*.txt)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

list_tracked_changed_paths() {
  {
    git -C "$REPO_ROOT" diff --name-only --relative
    git -C "$REPO_ROOT" diff --name-only --cached --relative
  } | sed '/^$/d' | sort -u
}

ensure_no_tracked_code_changes() {
  local path
  local -a blocking_paths=()
  local -a ignored_paths=()

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if is_non_code_git_path "$path"; then
      ignored_paths+=("$path")
    else
      blocking_paths+=("$path")
    fi
  done < <(list_tracked_changed_paths)

  if [[ "${#blocking_paths[@]}" -gt 0 ]]; then
    echo "Tracked code-impacting git changes detected. Commit/stash/revert before local deploy preflight." >&2
    printf 'Blocking paths:\n' >&2
    printf '  - %s\n' "${blocking_paths[@]}" >&2
    git -C "$REPO_ROOT" status -sb --untracked-files=no >&2
    exit 1
  fi

  if [[ "${#ignored_paths[@]}" -gt 0 ]]; then
    echo "Ignoring tracked docs/log-only changes for local deploy preflight:" >&2
    printf '  - %s\n' "${ignored_paths[@]}" >&2
  fi
}

if [[ "$ALLOW_DIRTY_GIT" != "1" ]] && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ensure_no_tracked_code_changes
fi

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
if [[ -z "$LOG_DIR" ]]; then
  LOG_DIR="$REPO_ROOT/deploy-logs/local-deploy-preflight-$TIMESTAMP"
fi
mkdir -p "$LOG_DIR"

: "${ASTRAL_API_BASE:=https://astralpirates.com}"
: "${NUXT_PUBLIC_ASTRAL_API_BASE:=${ASTRAL_API_BASE}}"
: "${FRONTEND_ORIGIN:=https://astralpirates.com}"
: "${PAYLOAD_PUBLIC_SERVER_URL:=${ASTRAL_API_BASE}}"
: "${REGISTER_LINK_BASE:=${FRONTEND_ORIGIN%/}/enlist/accept}"
: "${RUN_SEED:=1}"
: "${NUXT_DEVTOOLS:=0}"
: "${PAYLOAD_SECRET:=ci-payload-secret}"
: "${CLIENT_EVENT_SECRET:=ci-client-event-secret}"
: "${MESSAGING_MASTER_KEY:=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff}"
: "${POSTGRES_DB:=astralpirates}"
: "${POSTGRES_USER:=astral}"
: "${POSTGRES_PASSWORD:=ci-postgres-password}"
: "${DATABASE_URL:=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}}"
: "${CMS_REDIS_URL:=redis://localhost:6379/0}"
: "${REDIS_URL:=redis://localhost:6379/0}"
: "${NEO4J_URI:=bolt://localhost:7687}"
: "${NEO4J_USER:=neo4j}"
: "${NEO4J_PASSWORD:=ci-neo4j-password}"
: "${SMTP_HOST:=smtp.ci.local}"
: "${SMTP_PORT:=587}"
: "${SMTP_USER:=ci-user}"
: "${SMTP_PASSWORD:=ci-password}"
: "${EMAIL_FROM_NAME:=Astral Pirates CI}"
: "${EMAIL_FROM_ADDRESS:=ci-mailer@astralpirates.local}"

# Keep workspace lanes aligned with ci.yml workspace-ci: media storage env is only set on
# schema/docker lanes, never for global lint/test/build.
for key in \
  MEDIA_STORAGE_PROVIDER \
  MEDIA_BASE_URL \
  MEDIA_S3_ENDPOINT \
  MEDIA_S3_INTERNAL_ENDPOINT \
  MEDIA_S3_REGION \
  MEDIA_S3_FORCE_PATH_STYLE \
  MEDIA_S3_ACCESS_KEY_ID \
  MEDIA_S3_SECRET_ACCESS_KEY \
  MEDIA_BUCKET_AVATARS \
  MEDIA_BUCKET_GALLERY \
  MEDIA_BUCKET_TASKS \
  MEDIA_BUCKET_BADGES
do
  unset "$key"
done

# Force local media storage for workspace-ci-equivalent lanes so local .env values
# cannot flip build/test behavior.
MEDIA_STORAGE_PROVIDER=local
# Ensure Nuxt devtools stay off during preflight builds regardless of caller env.
NUXT_DEVTOOLS=0

export ASTRAL_API_BASE
export NUXT_PUBLIC_ASTRAL_API_BASE
export FRONTEND_ORIGIN
export PAYLOAD_PUBLIC_SERVER_URL
export REGISTER_LINK_BASE
export RUN_SEED
export NUXT_DEVTOOLS
export PAYLOAD_SECRET
export CLIENT_EVENT_SECRET
export MESSAGING_MASTER_KEY
export POSTGRES_DB
export POSTGRES_USER
export POSTGRES_PASSWORD
export DATABASE_URL
export CMS_REDIS_URL
export REDIS_URL
export NEO4J_URI
export NEO4J_USER
export NEO4J_PASSWORD
export SMTP_HOST
export SMTP_PORT
export SMTP_USER
export SMTP_PASSWORD
export EMAIL_FROM_NAME
export EMAIL_FROM_ADDRESS
export MEDIA_STORAGE_PROVIDER

# Some local Node/npm setups inject a bare `--localstorage-file` option that breaks
# Nuxt prerender. Force a valid path when the runtime supports this flag.
ASTRAL_NODE_LOCALSTORAGE_FILE="${ASTRAL_NODE_LOCALSTORAGE_FILE:-${TMPDIR:-/tmp}/astral-node-localstorage}"
if node --localstorage-file="${ASTRAL_NODE_LOCALSTORAGE_FILE}" -e "process.exit(0)" >/dev/null 2>&1; then
  export NODE_OPTIONS="--localstorage-file=${ASTRAL_NODE_LOCALSTORAGE_FILE}"
fi

run_step() {
  local name="$1"
  shift
  local log_file="$LOG_DIR/${name}.log"
  printf '\n→ %s\n' "$name"
  (
    cd "$REPO_ROOT"
    "$@"
  ) 2>&1 | tee "$log_file"
}

run_step_cmd() {
  local name="$1"
  shift
  local log_file="$LOG_DIR/${name}.log"
  printf '\n→ %s\n' "$name"
  (
    cd "$REPO_ROOT"
    bash -lc "$*"
  ) 2>&1 | tee "$log_file"
}

run_backup_readiness() {
  local target="$BACKUP_PREFLIGHT_TARGET"
  if [[ -z "$target" && -n "${DEPLOY_USER:-}" && -n "${DEPLOY_HOST:-}" ]]; then
    target="${DEPLOY_USER}@${DEPLOY_HOST}"
  fi
  if [[ -z "$target" ]]; then
    echo "backup-readiness requires --backup-target or DEPLOY_USER/DEPLOY_HOST env vars." >&2
    return 1
  fi

  if ! [[ "$BACKUP_PREFLIGHT_PORT" =~ ^[0-9]+$ ]]; then
    echo "backup-readiness: --backup-port must be a non-negative integer." >&2
    return 1
  fi
  if ! [[ "$BACKUP_PREFLIGHT_MAX_BACKUP_AGE_HOURS" =~ ^[0-9]+$ ]]; then
    echo "backup-readiness: --backup-max-age-hours must be a non-negative integer." >&2
    return 1
  fi
  if ! [[ "$BACKUP_PREFLIGHT_MAX_RESTORE_DRILL_AGE_HOURS" =~ ^[0-9]+$ ]]; then
    echo "backup-readiness: --restore-drill-max-age-hours must be a non-negative integer." >&2
    return 1
  fi

  local -a cmd=(
    bash
    scripts/ops/check-backup-readiness.sh
    --target "$target"
    --port "$BACKUP_PREFLIGHT_PORT"
    --max-backup-age-hours "$BACKUP_PREFLIGHT_MAX_BACKUP_AGE_HOURS"
    --max-restore-drill-age-hours "$BACKUP_PREFLIGHT_MAX_RESTORE_DRILL_AGE_HOURS"
  )

  if [[ -n "$BACKUP_PREFLIGHT_SSH_KEY" ]]; then
    cmd+=(--ssh-key "$BACKUP_PREFLIGHT_SSH_KEY")
  fi

  local require_remote
  require_remote=$(printf '%s' "$BACKUP_PREFLIGHT_REQUIRE_REMOTE_RESTORE_SOURCE" | tr '[:upper:]' '[:lower:]')
  case "$require_remote" in
    0|false|no|off)
      cmd+=(--allow-local-restore-source)
      ;;
  esac

  local require_grafana
  require_grafana=$(printf '%s' "$BACKUP_PREFLIGHT_REQUIRE_GRAFANA" | tr '[:upper:]' '[:lower:]')
  case "$require_grafana" in
    1|true|yes|on)
      cmd+=(--require-grafana)
      ;;
  esac

  "${cmd[@]}"
}

run_runtime_env_readiness() {
  local target="$BACKUP_PREFLIGHT_TARGET"
  if [[ -z "$target" && -n "${DEPLOY_USER:-}" && -n "${DEPLOY_HOST:-}" ]]; then
    target="${DEPLOY_USER}@${DEPLOY_HOST}"
  fi
  if [[ -z "$target" ]]; then
    echo "runtime-env-readiness requires --backup-target or DEPLOY_USER/DEPLOY_HOST env vars." >&2
    return 1
  fi

  if ! [[ "$BACKUP_PREFLIGHT_PORT" =~ ^[0-9]+$ ]]; then
    echo "runtime-env-readiness: --backup-port must be a non-negative integer." >&2
    return 1
  fi

  local -a cmd=(
    bash
    scripts/ops/check-runtime-env-readiness.sh
    --target "$target"
    --port "$BACKUP_PREFLIGHT_PORT"
    --env-path "$RUNTIME_ENV_PATH"
  )

  if [[ -n "$BACKUP_PREFLIGHT_SSH_KEY" ]]; then
    cmd+=(--ssh-key "$BACKUP_PREFLIGHT_SSH_KEY")
  fi

  "${cmd[@]}"
}

run_live_legacy_media_parity() {
  if ! [[ "$ASTRAL_API_BASE" =~ ^https?:// ]]; then
    echo "Skipping live legacy media parity probe; ASTRAL_API_BASE is not an absolute http(s) URL: $ASTRAL_API_BASE"
    return 0
  fi

  if ! [[ "$LIVE_LEGACY_MEDIA_PARITY_MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
    echo "legacy-media-route-parity-live: LIVE_LEGACY_MEDIA_PARITY_MAX_ATTEMPTS must be a positive integer." >&2
    return 1
  fi
  if ! [[ "$LIVE_LEGACY_MEDIA_PARITY_INITIAL_BACKOFF_SECONDS" =~ ^[0-9]+$ ]]; then
    echo "legacy-media-route-parity-live: LIVE_LEGACY_MEDIA_PARITY_INITIAL_BACKOFF_SECONDS must be a non-negative integer." >&2
    return 1
  fi
  if ! [[ "$LIVE_LEGACY_MEDIA_PARITY_MAX_BACKOFF_SECONDS" =~ ^[0-9]+$ ]]; then
    echo "legacy-media-route-parity-live: LIVE_LEGACY_MEDIA_PARITY_MAX_BACKOFF_SECONDS must be a non-negative integer." >&2
    return 1
  fi

  local attempt=1
  local backoff_seconds="$LIVE_LEGACY_MEDIA_PARITY_INITIAL_BACKOFF_SECONDS"
  local max_attempts="$LIVE_LEGACY_MEDIA_PARITY_MAX_ATTEMPTS"
  local max_backoff_seconds="$LIVE_LEGACY_MEDIA_PARITY_MAX_BACKOFF_SECONDS"

  while (( attempt <= max_attempts )); do
    echo "legacy-media-route-parity-live attempt ${attempt}/${max_attempts}"
    if node scripts/check-legacy-media-route-parity.mjs --base "$ASTRAL_API_BASE"; then
      return 0
    fi
    if (( attempt == max_attempts )); then
      echo "legacy-media-route-parity-live failed after ${max_attempts} attempts." >&2
      return 1
    fi

    echo "legacy-media-route-parity-live retrying in ${backoff_seconds}s..."
    sleep "$backoff_seconds"
    if (( backoff_seconds < max_backoff_seconds )); then
      backoff_seconds=$(( backoff_seconds * 2 ))
      if (( backoff_seconds > max_backoff_seconds )); then
        backoff_seconds="$max_backoff_seconds"
      fi
    fi
    attempt=$(( attempt + 1 ))
  done
}

run_actionlint() {
  if command -v actionlint >/dev/null 2>&1; then
    actionlint -config-file .github/actionlint.yaml
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "$REPO_ROOT":/repo \
      -w /repo \
      rhysd/actionlint:1.7.11 \
      -config-file .github/actionlint.yaml
    return
  fi

  echo "actionlint not found and docker is unavailable; cannot run CI parity lint lane." >&2
  return 1
}

run_shellcheck() {
  local -a shell_files=()
  while IFS= read -r file_path; do
    shell_files+=("$file_path")
  done < <(git -C "$REPO_ROOT" ls-files "*.sh")
  if [[ "${#shell_files[@]}" -eq 0 ]]; then
    echo "No tracked shell scripts found for shellcheck."
    return
  fi

  if command -v shellcheck >/dev/null 2>&1; then
    shellcheck -x "${shell_files[@]}"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "$REPO_ROOT":/repo \
      -w /repo \
      koalaman/shellcheck:stable \
      shellcheck -x "${shell_files[@]}"
    return
  fi

  echo "shellcheck not found and docker is unavailable; cannot run CI parity shell lint lane." >&2
  return 1
}

if [[ "$SKIP_BACKUP_READINESS" != "1" ]]; then
  run_step "backup-readiness" run_backup_readiness
else
  echo "→ backup-readiness skipped (--skip-backup-readiness)"
fi

if [[ "$SKIP_RUNTIME_ENV_READINESS" != "1" ]]; then
  run_step "runtime-env-readiness" run_runtime_env_readiness
else
  echo "→ runtime-env-readiness skipped (--skip-runtime-env-readiness)"
fi

run_step "actionlint" run_actionlint
run_step "shellcheck" run_shellcheck

if [[ "$SKIP_INSTALL" != "1" ]]; then
  run_step "install-dependencies" pnpm install --frozen-lockfile
fi

run_step "check-pnpm-hygiene" node scripts/check-pnpm-hygiene.mjs
run_step "check-cms-stack" pnpm check:cms-stack
run_step "plan-status" pnpm plan:status
run_step "docs-lint" pnpm docs:lint
run_step "lint-all" pnpm lint:all
run_step "typecheck-workspaces" bash -lc "pnpm --dir frontend typecheck && pnpm --dir cms typecheck && pnpm --filter '@astralpirates/shared' typecheck"
run_step "test-workspaces" bash -lc "pnpm --dir frontend test -- --coverage && pnpm --dir cms test -- --coverage && pnpm --filter '@astralpirates/shared' test"
run_step "build-workspaces" pnpm build:all
run_step "frontend-chunk-budgets" pnpm check:frontend:chunk-budgets
run_step "frontend-chunk-budgets-tests" pnpm run test:chunk-budgets
run_step "validate-frontend-api-base" node scripts/validate-frontend-api-base.mjs
if [[ "$RUN_LIVE_LEGACY_MEDIA_PARITY" == "1" ]]; then
  run_step "legacy-media-route-parity-live" run_live_legacy_media_parity
fi

run_step_cmd "schema-guard" "\
  export MEDIA_STORAGE_PROVIDER=seaweedfs; \
  export MEDIA_BASE_URL=https://artifact.astralpirates.com; \
  export MEDIA_S3_ENDPOINT=https://artifact.astralpirates.com/s3; \
  export MEDIA_S3_INTERNAL_ENDPOINT=http://seaweedfs:8333; \
  export MEDIA_S3_REGION=us-east-1; \
  export MEDIA_S3_FORCE_PATH_STYLE=true; \
  export MEDIA_S3_ACCESS_KEY_ID=ci-media-access-key; \
  export MEDIA_S3_SECRET_ACCESS_KEY=ci-media-secret-key; \
  export MEDIA_BUCKET_AVATARS=avatars; \
  export MEDIA_BUCKET_GALLERY=gallery; \
  export MEDIA_BUCKET_TASKS=tasks; \
  export MEDIA_BUCKET_BADGES=badges; \
  pnpm --dir cms exec payload generate:db-schema --config ./payload.config.ts && \
  pnpm --dir cms exec payload generate:importmap --config ./payload.config.ts && \
  node scripts/patch-payload-generated-schema.mjs && \
  git diff --exit-code -- cms/src/payload-generated-schema.ts 'cms/app/(payload)/admin/importMap.js'"

run_step "package-deploy-artifacts" bash scripts/ci/package-deploy-artifacts.sh
run_step_cmd "check-artifact-archives" "\
  test -s artifacts/shared/shared.tar.gz && \
  test -s artifacts/cms/cms.tar.gz && \
  test -s artifacts/frontend/frontend.tar.gz && \
  tar -tzf artifacts/frontend/frontend.tar.gz | grep -qE '(^|\\./)200\\.html$' && \
  tar -tzf artifacts/frontend/frontend.tar.gz | grep -qE '(^|\\./)sitemap\\.xml$'"

FRONTEND_TAR_EXTRACT_DIR="$(mktemp -d)"
trap 'rm -rf "$FRONTEND_TAR_EXTRACT_DIR"' EXIT
tar -xzf "$REPO_ROOT/artifacts/frontend/frontend.tar.gz" -C "$FRONTEND_TAR_EXTRACT_DIR"
run_step "validate-packaged-frontend" node scripts/validate-frontend-api-base.mjs --file "$FRONTEND_TAR_EXTRACT_DIR/200.html"

if [[ "$RUN_PLAYWRIGHT_E2E" == "1" ]]; then
  run_step_cmd "docker-e2e" "\
    export RUN_SEED=1; \
    export PAYLOAD_DB_PUSH=false; \
    export DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}; \
    export CMS_REDIS_URL=redis://redis:6379/0; \
    export REDIS_URL=redis://redis:6379/0; \
    export NEO4J_URI=bolt://neo4j:7687; \
    export MEDIA_STORAGE_PROVIDER=seaweedfs; \
    export MEDIA_BASE_URL=http://seaweedfs:8333; \
    export MEDIA_S3_ENDPOINT=http://seaweedfs:8333; \
    export MEDIA_S3_INTERNAL_ENDPOINT=http://seaweedfs:8333; \
    export MEDIA_S3_REGION=us-east-1; \
    export MEDIA_S3_FORCE_PATH_STYLE=true; \
    export MEDIA_S3_ACCESS_KEY_ID=ci-media-access-key; \
    export MEDIA_S3_SECRET_ACCESS_KEY=ci-media-secret-key; \
    export MEDIA_BUCKET_AVATARS=avatars; \
    export MEDIA_BUCKET_GALLERY=gallery; \
    export MEDIA_BUCKET_TASKS=tasks; \
    export MEDIA_BUCKET_BADGES=badges; \
    pnpm docker:e2e"
elif [[ "$RUN_DOCKER_TEST" == "1" ]]; then
  run_step_cmd "docker-test" "\
    export PAYLOAD_DB_PUSH=false; \
    export DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}; \
    export CMS_REDIS_URL=redis://redis:6379/0; \
    export REDIS_URL=redis://redis:6379/0; \
    export NEO4J_URI=bolt://neo4j:7687; \
    export MEDIA_STORAGE_PROVIDER=seaweedfs; \
    export MEDIA_BASE_URL=https://artifact.astralpirates.com; \
    export MEDIA_S3_ENDPOINT=http://seaweedfs:8333; \
    export MEDIA_S3_INTERNAL_ENDPOINT=http://seaweedfs:8333; \
    export MEDIA_S3_REGION=us-east-1; \
    export MEDIA_S3_FORCE_PATH_STYLE=true; \
    export MEDIA_S3_ACCESS_KEY_ID=ci-media-access-key; \
    export MEDIA_S3_SECRET_ACCESS_KEY=ci-media-secret-key; \
    export MEDIA_BUCKET_AVATARS=avatars; \
    export MEDIA_BUCKET_GALLERY=gallery; \
    export MEDIA_BUCKET_TASKS=tasks; \
    export MEDIA_BUCKET_BADGES=badges; \
    pnpm docker:test"
fi

printf '\n✓ Local deploy preflight passed. Logs: %s\n' "$LOG_DIR"
