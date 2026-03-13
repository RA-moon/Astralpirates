# Astral Pirates (Public Repository)

This repository is a sanitized, high-level mirror of the private Astral Pirates monorepo.

It is intentionally focused on:
- what is currently working
- how the platform is structured at a high level
- what is planned next

## What Works Today

- User accounts, authentication, and crew role management.
- Flight-plan collaboration flows (owner and crew coordination).
- Mission task workflows and mission media handling.
- Core deploy/backup reliability hardening already shipped.

Current high-level status is tracked in `STATUS.md`.

## How It Works (High Level)

- **Frontend**: Nuxt-based web application.
- **Backend/CMS**: Payload/Next.js API and content management.
- **Shared contracts**: typed shared package used across app and backend.
- **Operations**: CI/CD, backup/restore, and runtime guardrails are maintained in the private repository.

## What Is Planned

Roadmap direction is summarized in `ROADMAP.md` using high-level themes and priorities.

## Public Boundary

This public repository does **not** include:
- detailed internal planning and run logs
- deployment/infrastructure internals
- security/incident operational detail
- personal identity seed data or private contact details

## Release Policy

- Public updates are generated from a strict opt-in export.
- New files are excluded by default unless explicitly approved.
- Export history can be rewritten to a clean root snapshot when needed for hygiene.

Operational source of truth remains private.
