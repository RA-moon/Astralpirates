#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/ci/e2e-stack.sh <build|seed|start>
EOF
}

ACTION="${1:-}"

wait_for_healthy() {
  local service="$1"
  local timeout_s="$2"
  local id
  local start
  id="$(docker compose ps -q "$service")"
  if [[ -z "$id" ]]; then
    echo "No container id for $service" >&2
    docker compose ps
    return 1
  fi
  start="$(date +%s)"
  while true; do
    local status
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      echo "$service is healthy"
      break
    fi
    if (( $(date +%s) - start >= timeout_s )); then
      echo "Timed out waiting for $service to be healthy (status=$status)." >&2
      docker compose ps
      docker compose logs --tail=200 "$service" || true
      return 1
    fi
    sleep 3
  done
}

case "$ACTION" in
  build)
    docker compose build cms frontend
    ;;
  seed)
    if ! timeout 12m docker compose run --rm cms-seed; then
      echo "cms-seed failed or timed out; collecting diagnostics..."
      docker compose ps || true
      docker compose logs --tail=200 db neo4j seaweedfs seaweedfs-init cms-seed || true
      exit 1
    fi
    ;;
  start)
    # Start infra first, then app services without dependency resolution to avoid
    # intermittent compose dependency races ("No such container" on startup).
    docker compose up -d db neo4j redis seaweedfs seaweedfs-init
    docker compose up -d --no-deps cms frontend
    wait_for_healthy cms 240
    wait_for_healthy frontend 240
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
