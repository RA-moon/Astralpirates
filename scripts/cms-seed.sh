#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

# shellcheck source=./scripts/lib/docker-env.sh
source "${SCRIPT_DIR}/lib/docker-env.sh"

if [[ -n "${CMS_SEED_ENV_FILE:-}" ]]; then
  docker_env_require_local_secret_file "${CMS_SEED_ENV_FILE}" "scripts/cms-seed.sh" "CMS_SEED_ALLOW_LIVE_ENV_FILE"
  docker_env_load_file "${CMS_SEED_ENV_FILE}" || {
    echo "Requested CMS seed env file '${CMS_SEED_ENV_FILE}' not found." >&2
    exit 1
  }
else
  docker_env_require_local_secret_file "${REPO_ROOT}/.env" "scripts/cms-seed.sh default env" "CMS_SEED_ALLOW_LIVE_ENV_FILE"
  docker_env_load_file "${REPO_ROOT}/.env" >/dev/null || :
fi

docker_env_require_cms_redis_url

if [[ -n "${DATABASE_URL:-}" ]]; then
  DATABASE_URL_FOR_SEED="${DATABASE_URL}"
else
  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    cat <<'EOF' >&2
POSTGRES_PASSWORD is not set. Provide DATABASE_URL or POSTGRES_PASSWORD (plus POSTGRES_USER/POSTGRES_DB/POSTGRES_HOST if they differ from defaults) before running cms:seed to avoid relying on hardcoded credentials.
EOF
    exit 1
  fi

  DATABASE_URL_FOR_SEED="postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-db}:5432/${POSTGRES_DB:-astralpirates}"
fi
NEO4J_URI_FOR_SEED="${NEO4J_URI:-bolt://neo4j:7687}"
CMS_REDIS_URL_FOR_SEED="${CMS_REDIS_URL:-${REDIS_URL:-}}"

docker_env_require_local_service "${DATABASE_URL_FOR_SEED}" "DATABASE_URL" "postgres://<user>:<pass>@db:5432/<database>"
docker_env_require_local_service "${NEO4J_URI_FOR_SEED}" "NEO4J_URI" "bolt://neo4j:7687"
docker_env_require_local_service "${CMS_REDIS_URL_FOR_SEED}" "CMS_REDIS_URL" "redis://redis:6379/0"

cd "${REPO_ROOT}"
docker compose run --rm cms-seed "$@"
