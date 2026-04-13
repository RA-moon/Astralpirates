#!/usr/bin/env bash
set -euo pipefail

# Some local Node/npm setups inject a bare `--localstorage-file` option that
# breaks Nuxt prerender. Force a valid path when supported.
ASTRAL_NODE_LOCALSTORAGE_FILE="${ASTRAL_NODE_LOCALSTORAGE_FILE:-${TMPDIR:-/tmp}/astral-node-localstorage}"
if node --localstorage-file="${ASTRAL_NODE_LOCALSTORAGE_FILE}" -e "process.exit(0)" >/dev/null 2>&1; then
  export NODE_OPTIONS="--localstorage-file=${ASTRAL_NODE_LOCALSTORAGE_FILE}"
fi

# Nuxt devtools must stay off in production generate lanes.
export NUXT_DEVTOOLS="${NUXT_DEVTOOLS:-0}"

exec pnpm --dir frontend generate
