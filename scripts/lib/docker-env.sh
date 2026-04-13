#!/usr/bin/env bash

# shellcheck shell=bash

docker_env_is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

docker_env_normalize_path() {
  local candidate="${1:-}"
  if [[ -z "$candidate" ]]; then
    echo ""
    return 0
  fi

  if [[ "$candidate" == \~/* ]]; then
    candidate="${HOME}/${candidate#~/}"
  fi

  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$candidate" 2>/dev/null && return 0
  fi

  local dir base
  dir=$(dirname "$candidate")
  base=$(basename "$candidate")

  if [[ -d "$dir" ]]; then
    (
      cd "$dir" >/dev/null 2>&1 || exit 1
      printf '%s/%s\n' "$(pwd -P)" "$base"
    )
    return 0
  fi

  printf '%s\n' "$candidate"
}

docker_env_is_live_secret_path() {
  local candidate="${1:-}"
  if [[ -z "$candidate" ]]; then
    return 1
  fi

  local normalized lower base
  normalized=$(docker_env_normalize_path "$candidate")
  lower=$(printf '%s' "$normalized" | tr '[:upper:]' '[:lower:]')
  base=$(basename "$lower")

  case "$base" in
    .env.production|.env.prod|*.production.env|*.prod.env|*.live.env)
      return 0
      ;;
  esac

  if [[ "$lower" == *"/production/"* && "$base" == *.env ]]; then
    return 0
  fi
  if [[ "$lower" == *"/live/"* && "$base" == *.env ]]; then
    return 0
  fi

  if [[ "$lower" == *"/secrets/astralpirates/"* ]]; then
    case "$base" in
      *production*.env|*prod*.env|*live*.env)
        return 0
        ;;
    esac
  fi

  return 1
}

docker_env_require_local_secret_file() {
  local file_path="${1:-}"
  local context="${2:-this helper}"
  local allow_var="${3:-ALLOW_LIVE_ENV_FILE}"

  if [[ -z "$file_path" ]]; then
    return 0
  fi

  local normalized
  normalized=$(docker_env_normalize_path "$file_path")
  if ! docker_env_is_live_secret_path "$normalized"; then
    return 0
  fi

  local allow_value="${!allow_var:-0}"
  if docker_env_is_truthy "$allow_value"; then
    printf '%s\n' "${allow_var}=1 set; allowing live/prod env file for ${context}: ${normalized}" >&2
    return 0
  fi

  cat <<EOF >&2
${context} refused to use a live/prod env file:
  ${normalized}
Use a local-only env file for local tooling.
If this is intentional, set ${allow_var}=1 and rerun.
EOF
  exit 1
}

docker_env_load_file() {
  local candidate
  for candidate in "$@"; do
    if [[ -f "$candidate" ]]; then
      printf 'Loading environment from %s\n' "$candidate" >&2
      set -a
      # shellcheck disable=SC1090
      source "$candidate"
      set +a
      return 0
    fi
  done
  return 1
}

docker_env_require_cms_redis_url() {
  if [[ "${SKIP_CMS_REDIS_GUARD:-0}" == 1 ]]; then
    return 0
  fi

  local value="${CMS_REDIS_URL:-}"

  if [[ -z "$value" ]]; then
    cat <<'EOF' >&2
CMS_REDIS_URL is not set. Add CMS_REDIS_URL=redis://redis:6379/0 to your .env so Dockerized
seed/migration helpers can talk to the in-cluster Redis instance. See docs/local-docker.md for details.
EOF
    exit 1
  fi

  if [[ "$value" =~ ^redis://(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)(:[0-9]+)?(/.*)?$ ]]; then
    cat <<EOF >&2
CMS_REDIS_URL currently points at ${value}, which is unreachable from inside Docker containers.
Update CMS_REDIS_URL=redis://redis:6379/0 (or another container-visible host) in your .env before rerunning
docker-test or cms:seed. See docs/local-docker.md for the quick-start config.
EOF
    exit 1
  fi
}

docker_env_extract_host() {
  local url="$1"

  if [[ -z "$url" ]]; then
    echo ""
    return 0
  fi

  # If the value lacks a scheme, treat it as a bare host (e.g. "db").
  if [[ "$url" != *"://"* ]]; then
    echo "${url%%:*}"
    return 0
  fi

  local remainder="${url#*://}"
  remainder="${remainder#*@}"
  remainder="${remainder%%/*}"
  remainder="${remainder%%\?*}"
  remainder="${remainder%%#*}"
  local host="${remainder%%:*}"
  echo "$host"
}

docker_env_is_local_host() {
  local host="$1"
  if [[ -z "$host" ]]; then
    return 1
  fi

  if [[ "$host" =~ ^(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|db|postgres|neo4j|redis|astralpirates-db|astralpirates-neo4j|astralpirates-redis)$ ]]; then
    return 0
  fi

  return 1
}

docker_env_require_local_service() {
  local value="$1"
  local label="$2"
  local example="${3:-}"

  if [[ -z "$value" ]]; then
    cat <<EOF >&2
${label} is not set. Set it to a local endpoint${example:+ (e.g. ${example})} before running this helper.
EOF
    exit 1
  fi

  local host
  host=$(docker_env_extract_host "$value")
  if [[ -z "$host" ]]; then
    echo "Unable to determine host for ${label}; value: ${value}" >&2
    exit 1
  fi

  if docker_env_is_local_host "$host"; then
    return 0
  fi

  if [[ "${CMS_SEED_ALLOW_PRODUCTION:-0}" == "1" ]]; then
    echo "CMS_SEED_ALLOW_PRODUCTION=1 set; proceeding even though ${label} points at ${host}." >&2
    return 0
  fi

  cat <<EOF >&2
${label} points at ${host}, which is not recognized as a local Docker host. To avoid seeding non-local
databases/queues, cms:seed aborts by default. Update ${label} to a local endpoint${example:+ (e.g. ${example})}
or set CMS_SEED_ALLOW_PRODUCTION=true to override intentionally.
EOF
  exit 1
}
