# Astral Pirates (Public Repository)

This repository is an open-source code mirror of the Astral Pirates monorepo.

It intentionally includes implemented application code while excluding internal planning and
operations-only material.

## Included

- Frontend application implementation (`frontend/`)
- CMS/API implementation (`cms/`)
- Shared libraries/contracts (`shared/`)
- Supporting workspace and build files required to understand and run the code

## Excluded

- Internal planning docs and roadmap/planning archives
- Run logs and incident/operations notes
- Private deployment/ops scripts and infrastructure internals
- Seed data and any non-example secret/env files

## Public Release Model

- Export is strict opt-in and default-deny (`config/public-export-optin-manifest.txt` in private repo).
- Additional guardrails enforce blocklists, prohibited paths, and forbidden literal scans.
- Public snapshot content can be verified in dry-run before publishing.

The private repository remains the operational source of truth for internal runbooks and planning.
