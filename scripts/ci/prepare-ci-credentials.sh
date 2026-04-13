#!/usr/bin/env bash
set -euo pipefail

payload_secret="${CI_PAYLOAD_SECRET:-}"
postgres_password="${CI_POSTGRES_PASSWORD:-}"
neo4j_password="${CI_NEO4J_PASSWORD:-}"
messaging_master_key="${CI_MESSAGING_MASTER_KEY:-}"
client_event_secret="${CI_CLIENT_EVENT_SECRET:-}"
seed_default_password="${CI_SEED_DEFAULT_PASSWORD:-${SEED_DEFAULT_PASSWORD:-}}"

if [[ -z "$payload_secret" ]]; then
  payload_secret="$(openssl rand -hex 16)"
fi

if [[ -z "$postgres_password" ]]; then
  postgres_password="$(openssl rand -hex 12)"
fi

if [[ -z "$neo4j_password" ]]; then
  neo4j_password="$(openssl rand -hex 12)"
fi

if [[ -z "$messaging_master_key" ]]; then
  messaging_master_key="$(openssl rand -hex 32)"
fi

if [[ -z "$client_event_secret" ]]; then
  client_event_secret="$(openssl rand -hex 16)"
fi

if [[ -z "$seed_default_password" ]]; then
  seed_default_password="$(openssl rand -hex 12)"
fi

mask_secret() {
  local value="$1"
  if [[ -n "$value" ]]; then
    printf '::add-mask::%s\n' "$value"
  fi
}

mask_secret "$payload_secret"
mask_secret "$postgres_password"
mask_secret "$neo4j_password"
mask_secret "$messaging_master_key"
mask_secret "$client_event_secret"
mask_secret "$seed_default_password"
mask_secret "postgres://${CI_POSTGRES_USER}:${postgres_password}@localhost:5432/${CI_POSTGRES_DB}"

{
  echo "CI_PAYLOAD_SECRET=${payload_secret}"
  echo "PAYLOAD_SECRET=${payload_secret}"
  echo "CI_POSTGRES_PASSWORD=${postgres_password}"
  echo "POSTGRES_PASSWORD=${postgres_password}"
  echo "CI_NEO4J_PASSWORD=${neo4j_password}"
  echo "NEO4J_PASSWORD=${neo4j_password}"
  echo "CI_MESSAGING_MASTER_KEY=${messaging_master_key}"
  echo "MESSAGING_MASTER_KEY=${messaging_master_key}"
  echo "CI_CLIENT_EVENT_SECRET=${client_event_secret}"
  echo "CLIENT_EVENT_SECRET=${client_event_secret}"
  echo "CI_SEED_DEFAULT_PASSWORD=${seed_default_password}"
  echo "SEED_DEFAULT_PASSWORD=${seed_default_password}"
  echo "DATABASE_URL=postgres://${CI_POSTGRES_USER}:${postgres_password}@localhost:5432/${CI_POSTGRES_DB}"
} >> "$GITHUB_ENV"
