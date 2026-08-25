# Deployment Specification for Qwen (Agentic Execution)

<context>
You are Qwen (Qwen Code CLI, or an agent using the Alibaba Cloud Agent Skills Portal at
skills.alibabacloud.com) tasked with deploying a multi-tenant SaaS to Alibaba Cloud
International. This document is self-contained: it assumes no prior conversation memory.
Read this entire document before taking any action. Where a step says CONFIRM WITH OWNER,
stop and wait for explicit human approval before proceeding — do not treat silence as consent.
</context>

<project_summary>
Domain: a web application for deliberate practice of character qualities. Users log
"actions" (things they did) and tag which qualities showed up, rated 0-4 (0 means the
quality was relevant but showed up inverted — a real, meaningful value, not "unset").
Backend: Python 3.12, FastAPI, psycopg2 connection pool, PostgreSQL 15+ required (uses
Row-Level Security + composite ownership foreign keys `(user_id, id)` + `FORCE ROW LEVEL
SECURITY` + `security_invoker` views for multi-tenant isolation — do not weaken or bypass
any of this). Auth: Google Identity Services only, first-party JWT access+refresh tokens
with rotation (`SELECT ... FOR UPDATE` guards the refresh endpoint against a real,
previously-reproduced concurrency race — do not remove this lock). Frontend: Vite + React
19, react-router-dom, react-i18next (English only today), vite-plugin-pwa, static build
output (~310 KB JS). 53 backend pytest tests, 12 frontend vitest integration tests (the
frontend tests hit a real running backend, not mocks).

Repository layout (already created and git-initialized):
```
backend/            FastAPI app + tests + Dockerfile + Makefile + requirements.txt
frontend/           Vite/React app + tests + Dockerfile
database/           9 migration files, MUST be applied in numeric order 01->09
docker-compose.yml  Tier 1 local dev (Postgres 17 + backend + frontend)
docs/specifications/  architecture decision records and canonical specs
docs/research/         prior research reports (Alibaba Cloud blueprint, staged validation plan)
docs/adr/               ADR-001 (removal of is_relevant column) and future ADRs
docs/deployment/         this file, and HUMAN_DEPLOYMENT_GUIDE.md (the human-facing twin of this doc)
.github/workflows/       CI (test.yml at minimum)
```

Migration order is not optional: `08_migrate_and_cutover.sql` and `09_remove_is_relevant.sql`
must run even on a fresh database with zero data -- they finalize the schema shape (drop an
obsolete table, drop an obsolete column). `07_migrate_excel_data.py` is OPTIONAL and only
relevant if migrating the owner's specific historical data; skip it on any fresh environment.
</project_summary>

<tooling_setup>
1. Install Qwen Code: `npm install -g @qwen-code/qwen-code`, launch with `qwen` inside the
   repository root.
2. Authenticate: the free Qwen OAuth tier was discontinued 2026-04-15. Use a paid
   Alibaba Cloud Model Studio / DashScope-Intl API key (Singapore region), model
   `qwen3-coder-plus`, endpoint `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
   CONFIRM WITH OWNER that this key exists and is funded before proceeding to any
   resource-creating step.
3. Install the relevant Alibaba Cloud Agent Skills from skills.alibabacloud.com: at minimum
   the ECS, RDS, OSS, CDN, and CloudMonitor skills. Follow the one-line install command shown
   on each skill's page. These skills let you operate real cloud resources via natural
   language with built-in confirmation gates before critical operations -- use them in
   preference to raw `aliyun` CLI calls where available, since they carry verified,
   up-to-date operation definitions.
4. Region for all resources: **Singapore (ap-southeast-1)**. Do not use a mainland-China
   region under any circumstances -- this is an international product with no ICP filing.
</tooling_setup>

<execution_plan>
Execute the tiers below IN ORDER. Do not skip to Tier 3/4 without the owner explicitly
confirming Tier 1 and Tier 2 both pass their acceptance criteria -- this is the entire point
of the staged approach: prove the pipeline before spending money.

<tier id="1" name="local, already scaffolded">
`docker-compose.yml`, `Makefile`, and both `Dockerfile`s already exist in the repository.
Your task here (if not already done) is only to VERIFY, not to redesign:
1. `cp .env.example .env` and fill in a real `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` if
   available (a placeholder is acceptable for this tier -- Google OAuth itself cannot be
   tested without a real client id and a real browser).
2. `make dev-up` -- this starts Postgres, waits for health, runs migrations 01->06,08,09 in
   order (see Makefile comments for why 07 is skipped and why order matters -- app_writer
   does not exist until migration 01 completes), then starts backend+frontend.
3. `make dev-test` -- must show 53 backend tests and 12 frontend tests passing.
<acceptance>
`docker compose up` (via `make dev-up`) brings up the full stack from a clean checkout with
zero manual intervention beyond `.env` setup; `make dev-test` is fully green.
</acceptance>
</tier>

<tier id="2" name="free remote staging, outside Alibaba">
Purpose: prove the CI/CD pipeline and a real managed-Postgres 15+ target work, at zero cost,
before any Alibaba spend.
1. Create a free Neon project (neon.com) -- real PostgreSQL 17, no card required. Get the
   connection string.
2. Apply migrations 01->06,08,09 against the Neon connection string (same order as Tier 1;
   swap `SEED_DSN`/`DATABASE_URL` to point at Neon; app_writer's password should be changed
   from the hardcoded `change_me_in_production` default before this leaves localhost).
3. Deploy the backend to a free Render web service (render.com), pointed at the Neon DB via
   environment variables (`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`).
4. Deploy the frontend static build (`npm run build` -> `dist/`) to Cloudflare Pages, with
   `VITE_API_BASE_URL` pointed at the Render backend URL and SPA fallback configured
   (`_redirects: /* /index.html 200`).
5. Build `.github/workflows/deploy-staging.yml`: on push to `main`, run tests, then deploy
   frontend to Cloudflare Pages and trigger a Render deploy.
<acceptance>
A `git push` to `main` results in an automatic deploy; the live Cloudflare Pages URL
successfully talks to the live Render backend over HTTPS; a fresh Google login -> onboarding
-> log-an-action -> view-statistics round trip works against this staging deployment.
</acceptance>
CONFIRM WITH OWNER before proceeding to Tier 3 -- this is the last free tier.
</tier>

<tier id="3" name="Alibaba Cloud trial - exact target stack">
Purpose: rehearse the EXACT production topology on Alibaba's free trial before it becomes a
paid deployment. A card is required for account registration; trial resources should not
generate charges if released before expiry -- but READ THE COST WARNING below first.

<cost_warning priority="critical">
ApsaraDB RDS for PostgreSQL trial is pay-as-you-go and auto-converts to paid billing at
expiry -- it is NOT silently suspended, and NOT automatically released. You (Qwen) MUST set
a reminder for the owner and MUST NOT leave a trial RDS instance running unattended past its
expiry window (Individual account: 30 days; Enterprise: 60 days) without the owner's explicit
instruction to convert it to production. ECS trial instances, by contrast, are subscription-
type and simply expire without charge. Confirm the owner understands this asymmetry before
creating the RDS trial instance.
</cost_warning>

1. Register/confirm an Alibaba Cloud International account (non-mainland-China phone number
   + payment method required). CONFIRM WITH OWNER this account exists before creating any
   billable resource.
2. Using the Agent Skills Portal ECS skill: create a burstable ECS instance
   (`ecs.t6-c1m2.large` or `ecs.e-c1m2.large`, 2 vCPU/4 GB, Ubuntu 24.04 LTS, region
   Singapore). Security group: open 22/80/443 only. Prefer an SSH key pair over a password.
3. Using the RDS skill: create an ApsaraDB RDS for PostgreSQL trial instance. Select
   **PostgreSQL 16 or 17** in the version selector (both are safely supported; do not select
   PostgreSQL 18 for this rehearsal unless the owner specifically wants to test native
   `uuidv7()` -- if you do test PG18, explicitly verify whether `uuidv7()` exists as a
   built-in function before assuming it does; the app currently falls back to
   application-side UUID generation and that fallback must not be removed until this is
   confirmed). Whitelist the ECS instance's internal/private IP, not a public endpoint.
4. Apply migrations 01->06,08,09 against the RDS instance, from the ECS instance (internal
   network path) -- same order as Tiers 1 and 2.
5. On ECS: install Python 3.12, nginx; deploy the backend under a dedicated non-root user;
   create a systemd unit (`gunicorn -k uvicorn.workers.UvicornWorker`, workers = 2xvCPU+1,
   bound to 127.0.0.1:8000, `EnvironmentFile=/etc/qualities-api.env` chmod 600); configure
   nginx as a reverse proxy terminating TLS (Let's Encrypt via Certbot, NOT Alibaba's paid
   SSL service) and proxying to 127.0.0.1:8000, forwarding `X-Forwarded-Proto`.
6. Using the OSS + CDN skills: create an OSS bucket (Singapore), enable static website /
   SPA hosting (index document = `index.html`), upload the frontend build via `ossutil sync`
   (not the community GitHub Action, which has a reported bug resetting mirror rules), attach
   a CDN domain with HTTPS.
7. Extend `.github/workflows/` with a `deploy-alibaba.yml` using SSH-deploy (not Docker/ACR
   at this stage -- simpler for a solo owner) for the backend, and `ossutil sync` for the
   frontend.
8. Wire Sentry (backend `sentry-sdk[fastapi]`, frontend `@sentry/react` + `@sentry/vite-plugin`
   with hidden sourcemaps) and a free UptimeRobot monitor on a `/health` endpoint.
9. Perform ONE manual RDS backup-restore drill: RDS console -> Backup and Restoration ->
   restore to a NEW (temporary) instance -> verify row counts on key tables -> release the
   temporary instance. Do this on the trial instance to prove the process, not as routine
   practice yet.
<acceptance>
Identical pipeline as Tier 2, now running on the real target infrastructure; TLS is real
(not self-signed); the backup-restore drill has been performed and documented; native
`uuidv7()` availability on the chosen PG version has been explicitly checked and recorded.
</acceptance>
CONFIRM WITH OWNER before Tier 4 -- releasing/converting the trial RDS instance and moving to
paid production is a financial decision, not a technical one.
</tier>

<tier id="4" name="paid production">
Only after Tier 3's acceptance criteria are met and the owner has explicitly approved moving
to paid billing. Convert or recreate the RDS instance as **High-availability Edition** (for
the 99.99% SLA -- Basic Edition has no log backup / no point-in-time recovery and is not
acceptable for production). Point the production domain's DNS (A record -> ECS, CNAME -> CDN)
at the real infrastructure. Re-run the full acceptance checklist from Tier 3 against
production before announcing it live.
</tier>
</execution_plan>

<non_negotiables>
- Never weaken RLS, composite ownership FKs, `FORCE ROW LEVEL SECURITY`, or `security_invoker`
  on any view, for any reason, at any tier.
- Never commit a real secret (API key, JWT secret, DB password, Google client secret) to git.
  `.env` is gitignored; verify this remains true after any change to `.gitignore`.
- Never run migration `09_remove_is_relevant.sql` or `08_migrate_and_cutover.sql` against a
  database containing real user data without a fresh backup taken immediately before.
- Never select a mainland-China Alibaba Cloud region.
- Always output a plain-language summary of what you did and what it will cost (if anything)
  after each tier, before waiting for confirmation to proceed.
</non_negotiables>

<output_format>
After completing each numbered step within a tier, report back in this shape so the owner
(who may not read every log line) can verify progress at a glance:
```json
{"tier": 0, "step": 0, "action": "<what you did>", "result": "ok|failed", "cost_impact": "<none|estimated $/mo|one-time $>", "requires_owner_confirmation": false}
```
</output_format>
