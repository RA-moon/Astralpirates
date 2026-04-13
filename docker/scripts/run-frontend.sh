#!/usr/bin/env bash
set -euo pipefail

# Ensure dependencies are hydrated into mounted volumes before running Nuxt.
cd /workspace

/workspace/docker/scripts/bootstrap-node-modules.sh

runtime_mode="${FRONTEND_RUNTIME:-dev}"
export NUXT_BUILD_DIR="${NUXT_BUILD_DIR:-/workspace/frontend/.nuxt}"
rm -rf "${NUXT_BUILD_DIR}"

if [ "$runtime_mode" = "dev" ]; then
  pnpm --dir frontend dev
else
  if [ "${NUXT_BUILD_DIR}" != "/workspace/frontend/.nuxt" ]; then
    # frontend/tsconfig.json extends ./.nuxt/tsconfig.json; prepare it explicitly
    # when runtime builds use an alternate NUXT_BUILD_DIR (for example .nuxt-runtime).
    NUXT_BUILD_DIR="/workspace/frontend/.nuxt" pnpm --dir frontend exec nuxi prepare
  fi
  pnpm --dir frontend build
  pnpm --dir frontend preview
fi
