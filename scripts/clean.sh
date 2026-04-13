#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

usage() {
  cat <<'EOF'
Usage: scripts/clean.sh [options]

Removes common build/test artifacts without touching dependencies (node_modules).

Options:
  --all       Also removes deploy scratch dirs (deploy-logs/, tmp/, artifacts/)
  -h, --help  Show this help
EOF
}

INCLUDE_SCRATCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      INCLUDE_SCRATCH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

targets=(
  "cms/.next"
  "cms/.next-dev"
  "frontend/.nuxt"
  "frontend/.output"
  "frontend/test-results"
  "frontend/node-compile-cache"
  "frontend/.eslintcache"
)

if [[ $INCLUDE_SCRATCH -eq 1 ]]; then
  targets+=(
    "deploy-logs"
    "tmp"
    "artifacts"
  )
fi

echo "→ Cleaning build/test outputs"
for path in "${targets[@]}"; do
  if [[ -e "$path" ]]; then
    echo "  - rm -rf $path"
    rm -rf "$path"
  fi
done

echo "✓ Clean complete"

