#!/bin/sh
set -e

# Rebuild the static bundle before bringing containers up so nginx serves fresh assets.
pnpm --dir frontend generate

exec "$@"
