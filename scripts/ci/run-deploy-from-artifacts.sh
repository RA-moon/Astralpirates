#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DEPLOYMENT_ID_PREFIX="${DEPLOY_DEPLOYMENT_ID_PREFIX:-ci}"
DEPLOY_DEFAULT_RUN_SMOKE="${DEPLOY_DEFAULT_RUN_SMOKE:-true}"
DEPLOY_DEFAULT_RELEASE_MODE="${DEPLOY_DEFAULT_RELEASE_MODE:-}"
DEPLOY_BUNDLES_DIR="${DEPLOY_BUNDLES_DIR:-bundles}"
DEPLOY_ARTIFACTS_DIR="${DEPLOY_ARTIFACTS_DIR:-deploy-artifacts}"
DEPLOY_SSH_KEY_PATH="${DEPLOY_SSH_KEY_PATH:-$HOME/.ssh/astralpirates_deploy}"

is_truthy() {
  local value="${1:-}"
  case "${value,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

required=(DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_KEY_B64)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required deploy secret: ${key}" >&2
    exit 1
  fi
done

deploy_host="${DEPLOY_HOST:-}"
deploy_user="${DEPLOY_USER:-}"
deploy_ssh_key_b64="${DEPLOY_SSH_KEY_B64:-}"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
printf 'DEPLOY_PORT=%s\n' "$DEPLOY_PORT" >> "$GITHUB_ENV"

printf '::add-mask::%s\n' "$deploy_ssh_key_b64"
if [[ -n "${DEPLOY_SLACK_WEBHOOK:-}" ]]; then
  printf '::add-mask::%s\n' "$DEPLOY_SLACK_WEBHOOK"
fi
if [[ -n "${DEPLOY_GRAFANA_TOKEN:-}" ]]; then
  printf '::add-mask::%s\n' "$DEPLOY_GRAFANA_TOKEN"
fi

mkdir -p "$(dirname "$DEPLOY_SSH_KEY_PATH")"
if ! printf '%s' "${deploy_ssh_key_b64}" | base64 --decode > "$DEPLOY_SSH_KEY_PATH" 2>/dev/null; then
  echo "DEPLOY_SSH_KEY_B64 is not valid base64." >&2
  exit 1
fi
chmod 600 "$DEPLOY_SSH_KEY_PATH"

if [[ ! -s "$DEPLOY_SSH_KEY_PATH" ]]; then
  echo "Deploy SSH key could not be prepared." >&2
  exit 1
fi

mkdir -p ~/.ssh
ssh-keyscan -p "$DEPLOY_PORT" "$deploy_host" >> ~/.ssh/known_hosts

mkdir -p "${DEPLOY_ARTIFACTS_DIR}/shared" "${DEPLOY_ARTIFACTS_DIR}/cms" "${DEPLOY_ARTIFACTS_DIR}/frontend"
tar -xzf "${DEPLOY_BUNDLES_DIR}/shared/shared.tar.gz" -C "${DEPLOY_ARTIFACTS_DIR}/shared"
tar -xzf "${DEPLOY_BUNDLES_DIR}/cms/cms.tar.gz" -C "${DEPLOY_ARTIFACTS_DIR}/cms"
tar -xzf "${DEPLOY_BUNDLES_DIR}/frontend/frontend.tar.gz" -C "${DEPLOY_ARTIFACTS_DIR}/frontend"

BRANCH_NAME="${GITHUB_REF_NAME:-}"
if [[ -z "$BRANCH_NAME" ]]; then
  BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
fi

deployment_id="${DEPLOY_DEPLOYMENT_ID_PREFIX}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
run_url="${DEPLOY_RUN_URL:-}"
target="${deploy_user}@${deploy_host}"

CMD=(./scripts/deploy.sh
  --shared "${DEPLOY_ARTIFACTS_DIR}/shared"
  --cms "${DEPLOY_ARTIFACTS_DIR}/cms"
  --frontend "${DEPLOY_ARTIFACTS_DIR}/frontend"
  --git-sha "${GITHUB_SHA}"
  --branch "${BRANCH_NAME}"
  --deployment-id "${deployment_id}"
  --log-dir "deploy-logs"
  --health-base-url "${HEALTH_BASE_URL}"
  --target "${target}"
  --ssh-key "${DEPLOY_SSH_KEY_PATH}"
)

if [[ -n "${run_url}" ]]; then
  CMD+=(--run-url "${run_url}")
fi
if [[ -n "${DEPLOY_PORT:-}" ]]; then
  CMD+=(--port "${DEPLOY_PORT}")
fi

backfill_command="${DEPLOY_BACKFILL_COMMAND:-:}"
if is_truthy "${SYNC_PLANNING_CONTENT:-false}"; then
  backfill_command="${backfill_command} && ./node_modules/.bin/tsx ./src/scripts/syncPlanningContent.ts --force"
fi
if [[ -n "${backfill_command}" ]]; then
  CMD+=(--backfill-command "${backfill_command}")
fi
if [[ -n "${DEPLOY_BACKFILL_TIMEOUT_SECONDS:-}" ]]; then
  CMD+=(--backfill-timeout-seconds "${DEPLOY_BACKFILL_TIMEOUT_SECONDS}")
fi

run_smoke_value="${RUN_SMOKE:-$DEPLOY_DEFAULT_RUN_SMOKE}"
if is_truthy "$run_smoke_value"; then
  CMD+=(--playwright-smoke)
fi

release_mode_value="${DEPLOY_RELEASE_MODE:-$DEPLOY_DEFAULT_RELEASE_MODE}"
if is_truthy "$release_mode_value"; then
  CMD+=(--release-mode)
fi

if [[ -n "${DEPLOY_KEEP_RELEASES:-}" ]]; then
  CMD+=(--keep-releases "${DEPLOY_KEEP_RELEASES}")
fi

if is_truthy "${DEPLOY_ALLOW_LOCAL_MEDIA:-false}"; then
  CMD+=(--allow-local-media)
fi

if is_truthy "${ALLOW_MISSING_SPA_FALLBACK:-false}"; then
  CMD+=(--allow-missing-spa-fallback)
fi

if [[ -n "${DEPLOY_SLACK_WEBHOOK:-}" ]]; then
  CMD+=(--slack-webhook "${DEPLOY_SLACK_WEBHOOK}")
fi

if [[ -n "${DEPLOY_GRAFANA_ANNOTATION_URL:-}" ]]; then
  CMD+=(--grafana-annotation-url "${DEPLOY_GRAFANA_ANNOTATION_URL}")
fi

if [[ -n "${DEPLOY_GRAFANA_TOKEN:-}" ]]; then
  CMD+=(--grafana-token "${DEPLOY_GRAFANA_TOKEN}")
fi
if [[ -n "${DEPLOY_GRAFANA_CONNECT_TIMEOUT_SECONDS:-}" ]]; then
  CMD+=(--grafana-connect-timeout-seconds "${DEPLOY_GRAFANA_CONNECT_TIMEOUT_SECONDS}")
fi
if [[ -n "${DEPLOY_GRAFANA_MAX_TIME_SECONDS:-}" ]]; then
  CMD+=(--grafana-max-time-seconds "${DEPLOY_GRAFANA_MAX_TIME_SECONDS}")
fi

"${CMD[@]}"
