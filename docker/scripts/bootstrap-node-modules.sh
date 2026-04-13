#!/usr/bin/env bash
set -euo pipefail

ROOT_CACHE="/opt/node-modules-cache/root"
FRONTEND_CACHE="/opt/node-modules-cache/frontend"
CMS_CACHE="/opt/node-modules-cache/cms"

copy_if_missing() {
  local cache_dir="$1"
  local target_dir="$2"
  if [ ! -d "$target_dir" ] || [ -z "$(ls -A "$target_dir" 2>/dev/null || true)" ]; then
    mkdir -p "$target_dir"
    if [ -d "$cache_dir" ]; then
      cp -R "$cache_dir"/. "$target_dir"/
    fi
  fi
}

copy_if_missing "$ROOT_CACHE" "/workspace/node_modules"
copy_if_missing "$FRONTEND_CACHE" "/workspace/frontend/node_modules"
copy_if_missing "$CMS_CACHE" "/workspace/cms/node_modules"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required in the container image but was not found" >&2
  exit 1
fi

if [ ! -d /workspace/node_modules/.pnpm ] || [ ! -x /workspace/shared/node_modules/.bin/tsup ]; then
  CI=true pnpm install --frozen-lockfile
fi

if [ -d /workspace/frontend/node_modules/.pnpm ]; then
  # Nuxt embeds absolute host paths inside .nuxt/dist entries. Re-run prepare inside
  # the container so those files point to /workspace and work in Docker volumes.
  pnpm --dir frontend nuxt prepare >/dev/null
fi

if [ ! -f /workspace/shared/dist/env.mjs ]; then
  echo "Building @astralpirates/shared for container usage"
  pnpm --filter "@astralpirates/shared" build
fi
