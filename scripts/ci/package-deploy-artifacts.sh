#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/shared artifacts/cms artifacts/frontend

tar --exclude='node_modules' --exclude='.git' --exclude='.turbo' -czf artifacts/shared/shared.tar.gz -C shared .
sha256sum artifacts/shared/shared.tar.gz > artifacts/shared/shared.sha256

deploy_max_attempts=3
deploy_attempt=1
while true; do
  rm -rf artifacts/cms/cms-deploy
  if pnpm --filter astralpirates-cms deploy --prod --prefer-offline artifacts/cms/cms-deploy; then
    break
  fi
  if (( deploy_attempt >= deploy_max_attempts )); then
    echo "pnpm deploy failed after ${deploy_attempt} attempts." >&2
    exit 1
  fi
  deploy_attempt=$((deploy_attempt + 1))
  echo "pnpm deploy failed; retrying in 15s (attempt ${deploy_attempt}/${deploy_max_attempts})..." >&2
  sleep 15
done

rm -rf artifacts/cms/cms-deploy/.pnpm-store
rm -rf artifacts/cms/cms-deploy/.next-dev
rm -rf artifacts/cms/cms-deploy/.next/cache
rm -rf artifacts/cms/cms-deploy/public/media artifacts/cms/cms-deploy/media
rm -f artifacts/cms/cms-deploy/.env
find artifacts/cms/cms-deploy -maxdepth 1 -name ".env.*" ! -name "*.example" -delete
tar -czf artifacts/cms/cms.tar.gz -C artifacts/cms/cms-deploy .
sha256sum artifacts/cms/cms.tar.gz > artifacts/cms/cms.sha256

tar -czf artifacts/frontend/frontend.tar.gz -C frontend/.output/public .
sha256sum artifacts/frontend/frontend.tar.gz > artifacts/frontend/frontend.sha256
