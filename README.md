# Qualities — a daily practice of character

Multi-tenant web app for deliberate practice of character qualities: log what you did,
tag which qualities showed up, rate 0-4, watch trends over time.

## Start here

- **New to this repo?** Read `docs/deployment/HUMAN_DEPLOYMENT_GUIDE.md` (Russian) for the
  full staged path from local dev to production, with the reasoning behind each step.
- **An AI agent picking up deployment work?** Read `docs/deployment/QWEN_DEPLOYMENT_SPEC.md` --
  it is self-contained and assumes no prior context.
- **Local development:** `cp .env.example .env`, then `make dev-up` (Docker/Podman
  required). `make dev-test` runs both test suites (53 backend + 12 frontend).
- **Architecture:** `docs/specifications/` (canonical spec, security architecture, auth
  architecture) and `docs/adr/` (ADR-001: removal of `is_relevant`).
- **Prior research:** `docs/research/` (Alibaba Cloud deployment blueprint, staged
  zero-cost validation plan).

## Stack

FastAPI + psycopg2 + PostgreSQL 15+ (RLS + composite ownership FK + `security_invoker`
views -- see `docs/specifications/03_SECURITY_ARCHITECTURE_v1.0.md`) -- Google-only auth --
Vite + React 19 PWA -- 9 ordered SQL/Python migrations in `database/`.

## Status

Stages 0-4 complete (security gate, Google auth, catalog+ideals, full API v1, web PWA) --
65 automated tests passing. Stage 5 (deployment) is in progress; see the deployment docs
above for the current staged plan.
