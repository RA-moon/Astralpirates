# Astral Pirates (Public Repository)

This repository is the public code mirror of the Astral Pirates monorepo.

It intentionally contains only implemented source code plus this README.

## Included

- `frontend/`
- `cms/`
- `shared/`
- `eslint-plugin-astral-design/`

## Excluded

- Internal planning and roadmap documentation
- Operations runbooks and deployment internals
- Project status/change summary snapshots
- Non-example secret/env files

## Public Release Model

- Export is strict opt-in and default-deny.
- Guardrails enforce blocklists, prohibited paths, and forbidden literal scans.

The private repository remains the operational source of truth.
