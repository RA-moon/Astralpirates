#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$REPO_ROOT/.docker/dev-image.hash"

FILES_TO_WATCH=(
  "docker/Dockerfile.dev"
  "package.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "frontend/package.json"
  "cms/package.json"
  "shared/package.json"
)

absolute_files=()
for rel in "${FILES_TO_WATCH[@]}"; do
  absolute_files+=("$REPO_ROOT/$rel")
done

current_hash="$(
  cat "${absolute_files[@]}" | shasum -a 256 | awk '{print $1}'
)"

last_hash=""
if [[ -f "$STATE_FILE" ]]; then
  read -r last_hash <"$STATE_FILE"
fi

if [[ "$current_hash" == "$last_hash" ]]; then
  echo "astralpirates-node-dev already matches current dependency manifests (hash $current_hash); skipping build."
  exit 0
fi

echo "Building astralpirates-node-dev with dependency hash $current_hash..."
build_args=()
build_network="${DOCKER_BUILD_NETWORK:-}"
if [[ -z "$build_network" && "${CI:-}" == "true" ]]; then
  build_network="host"
fi
if [[ -n "$build_network" ]]; then
  build_args+=(--network "$build_network")
fi

if ((${#build_args[@]} > 0)); then
  DOCKER_BUILDKIT=1 docker build "${build_args[@]}" -t astralpirates-node-dev -f "$REPO_ROOT/docker/Dockerfile.dev" "$REPO_ROOT"
else
  DOCKER_BUILDKIT=1 docker build -t astralpirates-node-dev -f "$REPO_ROOT/docker/Dockerfile.dev" "$REPO_ROOT"
fi

mkdir -p "$(dirname "$STATE_FILE")"
printf '%s\n' "$current_hash" >"$STATE_FILE"
echo "Updated $STATE_FILE with new dependency hash."
