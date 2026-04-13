#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

# shellcheck source=./scripts/lib/docker-env.sh
source "${SCRIPT_DIR}/lib/docker-env.sh"

if [[ -n "${DOCKER_TEST_ENV_FILE:-}" ]]; then
  docker_env_require_local_secret_file "${DOCKER_TEST_ENV_FILE}" "scripts/docker-test.sh" "DOCKER_TEST_ALLOW_LIVE_ENV_FILE"
  docker_env_load_file "${DOCKER_TEST_ENV_FILE}" || {
    echo "Requested Docker env file '${DOCKER_TEST_ENV_FILE}' not found." >&2
    exit 1
  }
else
  docker_env_require_local_secret_file "${REPO_ROOT}/.env" "scripts/docker-test.sh default env" "DOCKER_TEST_ALLOW_LIVE_ENV_FILE"
  docker_env_load_file "${REPO_ROOT}/.env" >/dev/null || :
fi

docker_env_require_cms_redis_url

cd "${REPO_ROOT}"

# Use a deterministic local container prefix so this stack can run alongside
# other compose projects that use the default "astralpirates-*" names.
if [[ -z "${ASTRAL_CONTAINER_PREFIX:-}" ]]; then
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    ASTRAL_CONTAINER_PREFIX="${COMPOSE_PROJECT_NAME}"
  else
    ASTRAL_CONTAINER_PREFIX="astralpiratescom"
  fi
fi
export ASTRAL_CONTAINER_PREFIX

# Serialize docker-test runs per workspace to avoid concurrent `docker compose down`
# calls from separate agents/jobs tearing down each other mid-run.
DOCKER_TEST_LOCK_ACQUIRED=0
DOCKER_TEST_LOCK_DIR_ACQUIRED=""

acquire_docker_test_lock() {
  if [[ "${DOCKER_TEST_DISABLE_LOCK:-0}" == "1" ]]; then
    echo "DOCKER_TEST_DISABLE_LOCK=1; skipping docker-test run lock."
    return 0
  fi

  local lock_dir="${DOCKER_TEST_LOCK_DIR:-${REPO_ROOT}/.tmp/docker-test.lock}"
  local owner_file="${lock_dir}/owner"
  local wait_seconds="${DOCKER_TEST_LOCK_WAIT_SECONDS:-900}"
  local poll_seconds="${DOCKER_TEST_LOCK_POLL_SECONDS:-2}"
  local start_ts now_ts

  mkdir -p "$(dirname "${lock_dir}")"
  start_ts=$(date +%s)

  while ! mkdir "${lock_dir}" 2>/dev/null; do
    if [[ -f "${owner_file}" ]]; then
      local owner_pid owner_started owner_host
      owner_pid="$(awk -F= '/^pid=/{print $2}' "${owner_file}" 2>/dev/null || true)"
      owner_started="$(awk -F= '/^started=/{print $2}' "${owner_file}" 2>/dev/null || true)"
      owner_host="$(awk -F= '/^host=/{print $2}' "${owner_file}" 2>/dev/null || true)"

      if [[ -n "${owner_pid}" ]] && ! kill -0 "${owner_pid}" 2>/dev/null; then
        echo "Found stale docker-test lock owned by PID ${owner_pid}; removing stale lock."
        rm -rf "${lock_dir}" || true
        continue
      fi

      echo "docker-test lock held by PID ${owner_pid:-unknown} (host: ${owner_host:-unknown}, started: ${owner_started:-unknown}); waiting..."
    else
      echo "docker-test lock exists without metadata; waiting..."
    fi

    now_ts=$(date +%s)
    if (( now_ts - start_ts >= wait_seconds )); then
      echo "Timed out waiting ${wait_seconds}s for docker-test lock: ${lock_dir}" >&2
      echo "Inspect/remove stale lock manually, or set DOCKER_TEST_DISABLE_LOCK=1 to bypass (not recommended)." >&2
      return 1
    fi

    sleep "${poll_seconds}"
  done

  {
    printf 'pid=%s\n' "$$"
    printf 'started=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'host=%s\n' "$(hostname)"
  } >"${owner_file}"

  DOCKER_TEST_LOCK_ACQUIRED=1
  DOCKER_TEST_LOCK_DIR_ACQUIRED="${lock_dir}"
  echo "Acquired docker-test lock: ${lock_dir}"
}

release_docker_test_lock() {
  if [[ "${DOCKER_TEST_LOCK_ACQUIRED:-0}" != "1" ]]; then
    return 0
  fi

  if [[ -n "${DOCKER_TEST_LOCK_DIR_ACQUIRED:-}" ]]; then
    rm -rf "${DOCKER_TEST_LOCK_DIR_ACQUIRED}" || true
  fi

  DOCKER_TEST_LOCK_ACQUIRED=0
  DOCKER_TEST_LOCK_DIR_ACQUIRED=""
}

if ! acquire_docker_test_lock; then
  exit 1
fi
trap release_docker_test_lock EXIT

# CI runners can take >30s on first cold route + upload path; raise only for this script run.
export POSTGRES_IDLE_IN_TX_TIMEOUT_MS="${POSTGRES_IDLE_IN_TX_TIMEOUT_MS:-120000}"

BASE_SERVICES=(db neo4j redis seaweedfs seaweedfs-init)
APP_SERVICES=(cms)

if [[ ${RUN_E2E:-0} == 1 ]]; then
  export PAYLOAD_PUBLIC_SERVER_URL="${PAYLOAD_PUBLIC_SERVER_URL_E2E:-http://cms:3000}"
  export CMS_SEED_TESTCASE="${CMS_SEED_TESTCASE:-roles}"
  export SEED_DEFAULT_PASSWORD="${SEED_DEFAULT_PASSWORD:-dev-secret}"
  export PLAYWRIGHT_TESTCASE="${PLAYWRIGHT_TESTCASE:-${CMS_SEED_TESTCASE}}"
  export NUXT_PUBLIC_E2E_KEEP_SESSION_TOKEN="${NUXT_PUBLIC_E2E_KEEP_SESSION_TOKEN:-true}"
  if [[ -n "${PLAYWRIGHT_SEED_PASSWORD:-}" && "${PLAYWRIGHT_SEED_PASSWORD}" != "${SEED_DEFAULT_PASSWORD}" ]]; then
    echo "PLAYWRIGHT_SEED_PASSWORD differs from SEED_DEFAULT_PASSWORD; overriding to keep E2E credentials deterministic."
  fi
  export PLAYWRIGHT_SEED_PASSWORD="${SEED_DEFAULT_PASSWORD}"
fi

cleanup_nuxt_artifacts() {
  local nuxt_dir="frontend/.nuxt"
  if [[ -d "${nuxt_dir}" ]]; then
    echo "Removing stale Nuxt build artifacts at ${nuxt_dir}"
    chmod -R u+w "${nuxt_dir}" 2>/dev/null || true
    if ! rm -rf "${nuxt_dir}"; then
      echo "Direct delete failed, retrying via docker as root..."
      docker run --rm -v "${REPO_ROOT}/frontend":/workspace/frontend busybox sh -c "rm -rf /workspace/frontend/.nuxt"
    fi
  fi
}

cleanup_nuxt_artifacts
# Drop any cached ESLint state so new alias mappings are picked up consistently in CI
rm -f frontend/.eslintcache

if [[ ${RUN_E2E:-0} == 1 ]]; then
  echo "Resetting docker stack for deterministic E2E run"
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
fi

if [[ ${RUN_E2E:-0} == 1 || ${INCLUDE_FRONTEND:-0} == 1 ]]; then
  APP_SERVICES+=(frontend)
fi

if [[ ${RUN_E2E:-0} == 1 && -z ${PLAYWRIGHT_TEST_BASE_URL:-} ]]; then
  export PLAYWRIGHT_TEST_BASE_URL=http://frontend:3001
fi

if [[ -z ${FRONTEND_RUNTIME:-} ]]; then
  if [[ ${RUN_E2E:-0} == 1 ]]; then
    export FRONTEND_RUNTIME=prod
  else
    export FRONTEND_RUNTIME=dev
  fi
fi

host_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -n -P >/dev/null 2>&1
    return
  fi
  (echo >/dev/tcp/127.0.0.1/"${port}") >/dev/null 2>&1
}

next_available_port() {
  local candidate="$1"
  while host_port_in_use "${candidate}"; do
    candidate=$((candidate + 1))
  done
  printf '%s\n' "${candidate}"
}

ensure_optional_host_port() {
  local var_name="$1"
  local default_port="$2"
  local configured_port="${!var_name:-}"
  if [[ -n "${configured_port}" ]]; then
    return 0
  fi

  local selected_port
  selected_port="$(next_available_port "${default_port}")"
  if [[ "${selected_port}" != "${default_port}" ]]; then
    echo "${var_name} default ${default_port} is in use; using ${selected_port} for this run."
  fi
  export "${var_name}=${selected_port}"
}

# Seaweed host ports are not used by dockerized test traffic directly. Remap
# them when local defaults are occupied so local stacks can coexist.
ensure_optional_host_port SEAWEED_S3_PORT 8333
ensure_optional_host_port SEAWEED_MASTER_PORT 9333
ensure_optional_host_port SEAWEED_FILER_PORT 8888
ensure_optional_host_port SEAWEED_VOLUME_PORT 8082
ensure_optional_host_port POSTGRES_PORT 5433
ensure_optional_host_port NEO4J_HTTP_PORT 7474
ensure_optional_host_port NEO4J_BOLT_PORT 7687
ensure_optional_host_port REDIS_PORT 6379
ensure_optional_host_port CMS_PORT 3000
ensure_optional_host_port FRONTEND_PORT 8080

if [[ -z "${FRONTEND_ORIGIN:-}" ]]; then
  export FRONTEND_ORIGIN="http://localhost:${FRONTEND_PORT}"
fi

HOST_CMS_BASE_URL="http://localhost:${CMS_PORT}"

echo "Ensuring astralpirates-node-dev image is available"
bash "${SCRIPT_DIR}/build-dev-image.sh"

cleanup() {
  echo "Stopping docker services"
  if [[ ${RUN_E2E:-0} == 1 ]]; then
    docker compose down -v
  else
    docker compose down
  fi
  release_docker_test_lock
}
trap cleanup EXIT

start_compose_services() {
  local attempt
  local attempts="${DOCKER_SERVICE_START_ATTEMPTS:-3}"
  local interval="${DOCKER_SERVICE_START_RETRY_INTERVAL:-3}"

  if (( attempts < 1 )); then
    attempts=1
  fi

  for ((attempt=1; attempt<=attempts; attempt++)); do
    echo "Starting docker infrastructure services: ${BASE_SERVICES[*]} (attempt ${attempt}/${attempts})"
    if docker compose up -d "${BASE_SERVICES[@]}"; then
      echo "Starting docker application services: ${APP_SERVICES[*]} (attempt ${attempt}/${attempts})"
      if docker compose up -d --no-deps "${APP_SERVICES[@]}"; then
        return 0
      fi
    fi

    if (( attempt == attempts )); then
      return 1
    fi

    echo "Docker service bootstrap attempt ${attempt}/${attempts} failed; collecting quick diagnostics and retrying in ${interval}s..."
    docker compose ps || true
    docker compose logs seaweedfs || true
    docker compose logs cms || true
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
    sleep "${interval}"
  done

  return 1
}

if ! start_compose_services; then
  echo "Docker service bootstrap failed after retries." >&2
  docker compose ps > docker-ps.log || true
  docker compose logs seaweedfs > docker-seaweedfs.log || true
  docker compose logs cms > docker-cms.log || true
  exit 1
fi

wait_for_service() {
  local url="$1"
  local name="$2"
  local attempts=${WAIT_ATTEMPTS:-180}
  local interval=${WAIT_INTERVAL:-2}

  echo "Waiting for ${name} at ${url}"
  # Fail fast if the endpoint is up but returning a hard 404 (misconfigured path)
  local initial_status
  initial_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$url" || true)
  if [[ "${initial_status}" == "404" ]]; then
    echo "Received 404 from ${name} at ${url}; exiting early to avoid hanging" >&2
    return 1
  fi

  for ((i=1; i<=attempts; i++)); do
    if curl --fail --silent --output /dev/null "$url"; then
      echo "${name} is available"
      return 0
    fi
    sleep "$interval"
  done

  echo "Timed out waiting for ${name}" >&2
  return 1
}

wait_for_service_health() {
  local service="$1"
  local attempts=${WAIT_ATTEMPTS:-180}
  local interval=${WAIT_INTERVAL:-2}

  local container_id=""
  echo "Waiting for ${service} service container health"
  for ((i=1; i<=attempts; i++)); do
    if [[ -z "${container_id}" ]]; then
      container_id="$(docker compose ps -q "${service}" 2>/dev/null || true)"
    fi
    if [[ -z "${container_id}" ]]; then
      sleep "${interval}"
      continue
    fi
    local status="unknown"
    if status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null); then
      :
    fi
    if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
      echo "${service} service container is ${status}"
      return 0
    fi
    sleep "${interval}"
  done

  echo "Timed out waiting for ${service} service health check" >&2
  docker compose ps "${service}" >&2 || true
  return 1
}

ensure_service_running() {
  local service="$1"
  local container_id=""
  local status=""

  container_id="$(docker compose ps -q "${service}" 2>/dev/null || true)"
  if [[ -n "${container_id}" ]]; then
    status="$(docker inspect --format '{{.State.Status}}' "${container_id}" 2>/dev/null || true)"
  fi

  if [[ "${status}" == "running" ]]; then
    return 0
  fi

  echo "${service} service is not running (status: ${status:-missing}); attempting restart."
  if [[ -n "${container_id}" ]]; then
    docker compose logs "${service}" || true
  fi

  docker compose up -d --no-deps "${service}"
  wait_for_service_health "${service}"
}

run_docker_seed() {
  local attempts="${DOCKER_SEED_ATTEMPTS:-3}"
  local interval="${DOCKER_SEED_RETRY_INTERVAL:-3}"
  local attempt

  for ((attempt=1; attempt<=attempts; attempt++)); do
    if docker compose run --rm --use-aliases cms-seed; then
      return 0
    fi

    if (( attempt == attempts )); then
      return 1
    fi

    echo "Seed attempt ${attempt}/${attempts} failed; retrying in ${interval}s..."
    sleep "${interval}"
    docker compose up -d db neo4j redis seaweedfs seaweedfs-init >/dev/null 2>&1 || true
    docker compose up -d --no-deps cms >/dev/null 2>&1 || true
    wait_for_service_health "cms" || true
  done

  return 1
}

clear_stale_db_sessions() {
  echo "Clearing stale idle-in-transaction PostgreSQL sessions"
  docker compose exec -T db bash -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -P pager=off -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND state = '\''idle in transaction'\'' AND pid <> pg_backend_pid() AND now() - state_change > interval '\''20 seconds'\'';"' \
    >/dev/null || true
}

resolve_seed_captain_emails() {
  local testcase="${CMS_SEED_TESTCASE:-roles}"
  local candidates=()

  if [[ -n "${CHECK_TASK_SSE_EMAIL:-}" ]]; then
    candidates+=("${CHECK_TASK_SSE_EMAIL}")
  fi
  if [[ -n "${CMS_SEED_CAPTAIN_EMAIL:-}" ]]; then
    candidates+=("${CMS_SEED_CAPTAIN_EMAIL}")
  fi

  candidates+=("test-${testcase}.captain@astralpirates.com")
  if [[ "${testcase}" != "roles" ]]; then
    candidates+=("test-roles.captain@astralpirates.com")
  fi

  local unique=()
  local seen=""
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -z "${candidate}" ]]; then
      continue
    fi
    if [[ ",${seen}," == *",${candidate},"* ]]; then
      continue
    fi
    unique+=("${candidate}")
    seen="${seen},${candidate}"
  done

  printf '%s\n' "${unique[@]}"
}

wait_for_get_warmup() {
  local url="$1"
  local label="$2"
  local attempts="${E2E_WARMUP_ATTEMPTS:-80}"
  local interval="${E2E_WARMUP_INTERVAL:-3}"

  echo "Warming ${label} via ${url}"
  for ((i=1; i<=attempts; i++)); do
    if curl --silent --show-error --fail --output /dev/null --max-time 30 "${url}"; then
      echo "${label} warm-up succeeded"
      return 0
    fi
    sleep "${interval}"
  done

  echo "Timed out warming ${label} at ${url}" >&2
  return 1
}

wait_for_status_warmup() {
  local url="$1"
  local label="$2"
  local accepted_codes_csv="$3"
  local method="${4:-GET}"
  local attempts="${E2E_WARMUP_ATTEMPTS:-80}"
  local interval="${E2E_WARMUP_INTERVAL:-3}"

  if [[ -z "${accepted_codes_csv}" ]]; then
    echo "Accepted status-code list is required for ${label} warm-up." >&2
    return 1
  fi

  echo "Warming ${label} via ${method} ${url} (accepting: ${accepted_codes_csv})"
  for ((i=1; i<=attempts; i++)); do
    local status
    status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 -X "${method}" "${url}" || true)
    if [[ ",${accepted_codes_csv}," == *",${status},"* ]]; then
      echo "${label} warm-up succeeded (status ${status})"
      return 0
    fi
    sleep "${interval}"
  done

  echo "Timed out warming ${label} at ${url}; accepted statuses: ${accepted_codes_csv}" >&2
  return 1
}

wait_for_login_warmup() {
  local base_url="$1"
  local seed_password="$2"
  shift 2
  local captain_emails=("$@")
  local attempts="${E2E_WARMUP_ATTEMPTS:-80}"
  local interval="${E2E_WARMUP_INTERVAL:-3}"
  local login_url="${base_url%/}/api/auth/login"

  if [[ ${#captain_emails[@]} -eq 0 ]]; then
    echo "No candidate captain emails available for login warm-up." >&2
    return 1
  fi

  echo "Warming login route via ${login_url} (candidates: ${captain_emails[*]})"
  for ((i=1; i<=attempts; i++)); do
    local captain_email status
    for captain_email in "${captain_emails[@]}"; do
      status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 \
        -H 'content-type: application/json' \
        -d "{\"email\":\"${captain_email}\",\"password\":\"${seed_password}\"}" \
        "${login_url}" || true)
      if [[ "${status}" == "200" ]]; then
        export CHECK_TASK_SSE_EMAIL="${captain_email}"
        export PLAYWRIGHT_CAPTAIN_EMAIL="${captain_email}"
        echo "Login route warm-up succeeded (${captain_email})"
        return 0
      fi
    done
    sleep "${interval}"
  done

  echo "Timed out warming login route at ${login_url}; verify SEED_DEFAULT_PASSWORD/CMS_SEED_TESTCASE/CHECK_TASK_SSE_EMAIL." >&2
  return 1
}

warmup_e2e_routes() {
  local base_url="${PAYLOAD_PUBLIC_SERVER_URL_E2E:-${HOST_CMS_BASE_URL}}"
  local seed_password="${SEED_DEFAULT_PASSWORD:-}"
  local captain_emails=()
  local candidate_email
  while IFS= read -r candidate_email; do
    if [[ -n "${candidate_email}" ]]; then
      captain_emails+=("${candidate_email}")
    fi
  done < <(resolve_seed_captain_emails)

  if [[ -z "${seed_password}" ]]; then
    echo "SEED_DEFAULT_PASSWORD is required for E2E login warm-up." >&2
    return 1
  fi

  wait_for_login_warmup "${base_url}" "${seed_password}" "${captain_emails[@]}" || return 1
  wait_for_get_warmup "${base_url%/}/api/pages?where%5Bpath%5D%5Bequals%5D=%2F&depth=1&limit=1" "pages index route" || return 1
  wait_for_get_warmup "${base_url%/}/api/flight-plans?limit=5&depth=0" "flight plans index route" || return 1
  wait_for_get_warmup "${base_url%/}/api/roadmap-tiers?limit=1&depth=1" "roadmap tiers route" || return 1
  # Prime slower auth/profile/activity routes before Playwright starts so the
  # first browser-driven requests do not hit cold route compilation windows.
  wait_for_status_warmup "${base_url%/}/api/profiles/captain-roles" "captain profile route" "200,401,403" || return 1
  wait_for_status_warmup "${base_url%/}/api/logs?limit=5" "logs route" "200,401,403" || return 1
  wait_for_status_warmup "${base_url%/}/api/auth/session" "auth session route" "200,204,401,403" "OPTIONS" || return 1
  wait_for_status_warmup "${base_url%/}/api/activity" "activity route" "200,204,401,403,405" "OPTIONS" || return 1
  wait_for_status_warmup "${base_url%/}/api/matrix/bootstrap" "matrix bootstrap route" "200,204,401,403,405" "OPTIONS" || return 1
  wait_for_status_warmup "${base_url%/}/api/invitations" "invitations route" "200,204,401,403,405" "OPTIONS" || return 1
  wait_for_status_warmup "${base_url%/}/api/flight-plans/invitations" "flight-plan invitations route" "200,401,403" || return 1
}

CMS_URL=${CMS_URL:-${HOST_CMS_BASE_URL}/api/profiles/health}
if [[ ${SKIP_WAIT_FOR_CMS:-0} != 1 ]]; then
  # Prefer container health over host HTTP to avoid hanging when localhost is unreachable in CI
  if ! wait_for_service_health "cms"; then
    docker compose logs cms || true
    exit 1
  fi
  if ! wait_for_service "${CMS_URL}" "Payload CMS"; then
    docker compose logs cms || true
    exit 1
  fi
fi

CHECK_ORIGIN=${CHECK_ORIGIN:-${PLAYWRIGHT_TEST_BASE_URL:-${FRONTEND_ORIGIN:-http://localhost:8080}}}

if [[ ${RUN_E2E:-0} == 1 && ${RUN_SEED:-0} != 1 ]]; then
  RUN_SEED=1
fi

if [[ ${RUN_SEED:-0} == 1 ]]; then
  if [[ ${RUN_E2E:-0} == 1 && -z ${CMS_SEED_TOPUP:-} ]]; then
    export CMS_SEED_TOPUP=1
  fi
  if [[ ${RUN_E2E:-0} == 1 && -z ${CMS_SEED_ALLOW_PAGE_OVERWRITE:-} ]]; then
    export CMS_SEED_ALLOW_PAGE_OVERWRITE=true
  fi
  if [[ ${RUN_E2E:-0} == 1 && -z ${ELSA_TOPUP_CAPTAIN_MIN_TOKENS:-} ]]; then
    export ELSA_TOPUP_CAPTAIN_MIN_TOKENS=50
  fi
  echo "Seeding CMS content inside docker"
  if ! run_docker_seed; then
    echo "Seed step failed after retries; collecting docker logs..."
    docker compose ps > docker-ps.log || true
    docker compose logs cms > docker-cms.log || true
    docker compose logs db > docker-db.log || true
    exit 1
  fi
fi

clear_stale_db_sessions

echo "Running frontend lint and unit tests inside docker"
cleanup_nuxt_artifacts
docker compose run --rm -e FRONTEND_ORIGIN="${CHECK_ORIGIN}" frontend-tests

clear_stale_db_sessions

echo "Running media storage smoke check"
if ! ensure_service_running "cms"; then
  echo "CMS service failed to restart before media storage check; collecting docker logs..."
  docker compose ps > docker-ps.log || true
  docker compose logs cms > docker-cms.log || true
  exit 1
fi
if ! wait_for_service "${CMS_URL}" "Payload CMS"; then
  docker compose logs cms || true
  exit 1
fi

if ! docker compose exec -T \
  -e SEED_DEFAULT_PASSWORD="${SEED_DEFAULT_PASSWORD:-}" \
  -e CHECK_TASK_SSE_EMAIL="${CHECK_TASK_SSE_EMAIL:-}" \
  -e CMS_SEED_CAPTAIN_EMAIL="${CMS_SEED_CAPTAIN_EMAIL:-}" \
  -e CMS_SEED_TESTCASE="${CMS_SEED_TESTCASE:-}" \
  cms bash -lc "cd /workspace/cms && pnpm exec tsx src/scripts/ci/checkMediaStorage.ts"; then
  echo "Media storage smoke check failed; collecting docker logs..."
  docker compose ps > docker-ps.log || true
  docker compose logs cms > docker-cms.log || true
  docker compose logs seaweedfs > docker-seaweedfs.log || true
  exit 1
fi

clear_stale_db_sessions

echo "Running flight-plan task SSE integration check"
if ! docker compose exec -T \
  -e SEED_DEFAULT_PASSWORD="${SEED_DEFAULT_PASSWORD:-}" \
  -e CHECK_TASK_SSE_EMAIL="${CHECK_TASK_SSE_EMAIL:-}" \
  -e CMS_SEED_CAPTAIN_EMAIL="${CMS_SEED_CAPTAIN_EMAIL:-}" \
  -e CMS_SEED_TESTCASE="${CMS_SEED_TESTCASE:-}" \
  cms bash -lc "cd /workspace/cms && pnpm exec tsx src/scripts/ci/checkTaskSse.ts"; then
  echo "Task SSE integration check failed; collecting docker logs..."
  docker compose ps > docker-ps.log || true
  docker compose logs cms > docker-cms.log || true
  docker compose logs redis > docker-redis.log || true
  exit 1
fi

if [[ ${RUN_E2E:-0} == 1 ]]; then
  clear_stale_db_sessions
  wait_for_service_health "frontend"
  if ! warmup_e2e_routes; then
    echo "E2E warm-up failed; collecting docker logs..."
    docker compose ps > docker-ps.log || true
    docker compose logs cms > docker-cms.log || true
    docker compose logs frontend > docker-frontend.log || true
    exit 1
  fi
  echo "Running Playwright end-to-end suite via docker compose"
  docker compose --profile test run --rm \
    -e SEED_DEFAULT_PASSWORD="${SEED_DEFAULT_PASSWORD:-}" \
    -e PLAYWRIGHT_SEED_PASSWORD="${PLAYWRIGHT_SEED_PASSWORD:-}" \
    -e PLAYWRIGHT_TESTCASE="${PLAYWRIGHT_TESTCASE:-}" \
    -e PLAYWRIGHT_CAPTAIN_EMAIL="${PLAYWRIGHT_CAPTAIN_EMAIL:-}" \
    e2e
fi
