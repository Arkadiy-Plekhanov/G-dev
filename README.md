# Qualities — a daily practice of character

Multi-tenant web app for deliberate practice of character qualities: log what you did,
tag which qualities showed up, rate 0-4, watch trends over time.

**Live (Tier 2 staging, proven working end-to-end 2026-08-27):**
frontend `https://g-dev.arkadiy-plekhanov.workers.dev` · backend
`https://qualities-api-staging-1yiw.onrender.com` · database on Neon.

## Start here

- **Where the product is going?** Read `docs/MASTER_PLAN.md` (Russian) -- strategy, positioning,
  and the five-phase roadmap, grounded in four rounds of competitor/market/science research
  (`docs/research/`). The immediate phase is specced in
  `docs/specifications/07_PHASE_1_UI_COMPLETION.md`.
- **New to this repo?** Read `docs/deployment/HUMAN_DEPLOYMENT_GUIDE.md` (Russian) for the
  full staged path from local dev to production, with the reasoning behind each step --
  Tiers 1-2 are done and the guide reflects exactly how, including the real failures hit
  along the way and their actual causes.
- **An AI agent picking up deployment work?** Read `docs/deployment/QWEN_DEPLOYMENT_SPEC.md`
  -- it is self-contained and assumes no prior context.
- **Local development:** `cp .env.example .env`, then `make dev-up` (Docker/Podman
  required). `make dev-test` runs both test suites (55 backend + 12 frontend).
- **Resetting/reseeding the Neon staging database:** `scripts/reset-neon.sh` -- one
  command, verifies its own result (25 catalog qualities, 3 ideals), fails loudly instead
  of silently if anything doesn't match.
- **Architecture:** `docs/specifications/` (canonical spec, security architecture, auth
  architecture) and `docs/adr/` (ADR-001: removal of `is_relevant`).
- **Prior research:** `docs/research/` (Alibaba Cloud deployment blueprint, staged
  zero-cost validation plan, Neon/Render/Cloudflare deep-dive, Hard Road feature map --
  a screen-by-screen teardown of the closest competitor, built from primary screenshots
  because the app is not indexed anywhere publicly).

## Stack

FastAPI + psycopg2 (with pre-ping/retry resilience for Neon's autosuspend -- see
`backend/app/db.py`) + PostgreSQL 15+ (RLS + composite ownership FK + `security_invoker`
views -- see `docs/specifications/03_SECURITY_ARCHITECTURE_v1.0.md`) -- Google-only auth,
CORS with `allow_credentials=False` (Bearer-token auth, no cookies) -- Vite + React 19 PWA,
deployed to Cloudflare's Workers + Static Assets model (not classic Pages -- see
`frontend/wrangler.jsonc`) -- 9 ordered SQL/Python migrations in `database/`.

## Status

Stages 0-4 complete (security gate, Google auth, catalog+ideals, full API v1, web PWA).
Stage 5 (deployment): **Tier 1 (local) and Tier 2 (free remote staging on
Neon+Render+Cloudflare) are both done and proven live** with a real manual end-to-end test
(Google login -> onboarding -> log an action -> view statistics). Tier 3 (Alibaba Cloud
trial) has not been started. 67 automated tests passing (55 backend + 12 frontend).
