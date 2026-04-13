#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

usage() {
  cat <<'EOF'
Usage: scripts/clean-local.sh [options]

Removes common local-only outputs (logs, .DS_Store, tmp/artifacts) without touching git-tracked source.

Options:
  --all       Also removes local data dumps (backups/, dbdump/)
  -h, --help  Show this help
EOF
}

INCLUDE_DUMPS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      INCLUDE_DUMPS=1
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

echo "→ Cleaning build/test outputs"
bash "${REPO_ROOT}/scripts/clean.sh" --all

git_available=0
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_available=1
fi

is_tracked() {
  local rel="$1"
  if [[ $git_available -ne 1 ]]; then
    return 1
  fi
  git -C "$REPO_ROOT" ls-files --error-unmatch "$rel" >/dev/null 2>&1
}

delete_if_untracked() {
  local abs="$1"
  local rel="${abs#"$REPO_ROOT"/}"
  if is_tracked "$rel"; then
    return 0
  fi
  rm -rf "$abs"
}

echo "→ Cleaning log files and .DS_Store"
while IFS= read -r -d '' file; do
  delete_if_untracked "$file"
done < <(
  find "$REPO_ROOT" \
    \( -path "$REPO_ROOT/node_modules" -o -path "$REPO_ROOT/cms/node_modules" -o -path "$REPO_ROOT/frontend/node_modules" -o -path "$REPO_ROOT/shared/node_modules" -o -path "$REPO_ROOT/.pnpm-store" -o -path "$REPO_ROOT/cms/.pnpm-store" \) -prune -false \
    -o \( -type f -name '*.log' -o -type f -name '.DS_Store' \) -print0
)

if [[ $INCLUDE_DUMPS -eq 1 ]]; then
  echo "→ Cleaning local data dumps"
  delete_if_untracked "$REPO_ROOT/backups"
  delete_if_untracked "$REPO_ROOT/dbdump"
fi

echo "✓ Local clean complete"
