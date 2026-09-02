> ## ⚠️ ИСТОРИЧЕСКИЙ ДОКУМЕНТ — НЕ ИСТОЧНИК ПРАВДЫ
>
> Сохранён ради контекста решений: объясняет, ПОЧЕМУ проект пришёл к
> нынешнему устройству. Числа, имена файлов и инструкции в нём могли
> устареть и НЕ должны использоваться как руководство к действию.
>
> **Актуально вместо него:** `docs/deployment/HUMAN_DEPLOYMENT_GUIDE.md` — та же последовательность

---

# Deployment Specification for Qwen (Agentic Execution)

<context>
You are Qwen (Qwen Code CLI, or an agent using the Alibaba Cloud Agent Skills Portal at
skills.alibabacloud.com) tasked with deploying a multi-tenant SaaS to Alibaba Cloud
International. This document is self-contained: it assumes no prior conversation memory.
Read this entire document before taking any action. Where a step says CONFIRM WITH OWNER,
stop and wait for explicit human approval before proceeding -- do not treat silence as consent.

**Tier 1 and Tier 2 (below) are DONE and PROVEN LIVE as of 2026-08-27** -- not a plan, a
verified fact: real manual end-to-end testing (Google login -> onboarding -> log an action ->
view statistics) passed on the real deployed URLs. This document was rewritten after that
proof to replace an earlier, partially-wrong Tier 2 plan (it assumed classic Cloudflare
Pages; the real Cloudflare product in 2026 is a unified Workers + Static Assets model, which
is meaningfully different -- see Tier 2 below for the corrected, verified steps). If you are
picking this up fresh, Tier 3 (Alibaba trial) is the actual next unstarted work.
</context>

<project_summary>
Domain: a web application for deliberate practice of character qualities. Users log
"actions" (things they did) and tag which qualities showed up, rated 0-4 (0 means the
quality was relevant but showed up inverted -- a real, meaningful value, not "unset").
Backend: Python 3.12 (pinned explicitly -- see Tier 2), FastAPI, psycopg2 connection pool
with pre-ping + retry resilience (`backend/app/db.py` -- needed because the Tier 2 database
is on Neon, which suspends its compute after 5 minutes idle and kills open connections;
without this, the first request after any pause would fail), PostgreSQL 15+ required (uses
Row-Level Security + composite ownership foreign keys `(user_id, id)` + `FORCE ROW LEVEL
SECURITY` + `security_invoker` views for multi-tenant isolation -- do not weaken or bypass
any of this). Auth: Google Identity Services only, first-party JWT access+refresh tokens
with rotation (`SELECT ... FOR UPDATE` guards the refresh endpoint against a real,
previously-reproduced concurrency race -- do not remove this lock); CORS uses
`allow_credentials=False` (Bearer-token auth, no cookies -- do not change this without also
reconsidering the whole auth model). Frontend: Vite + React 19, react-router-dom,
react-i18next (English only today), vite-plugin-pwa, static build output (~310 KB JS).
55 backend pytest tests, 12 frontend vitest integration tests (the frontend tests hit a
real running backend, not mocks).

Repository layout (git-initialized, real remote on GitHub):
```
backend/            FastAPI app + tests + Dockerfile (LOCAL DEV ONLY, not Render -- see Tier 2) + Makefile + requirements.txt
frontend/           Vite/React app + tests + Dockerfile (local dev only) + wrangler.jsonc (Cloudflare -- see Tier 2)
database/           9 migration files, MUST be applied in numeric order 01->09
scripts/reset-neon.sh  proven, tested, one-command full reset+reseed for ANY remote Postgres target (see Tier 2)
docker-compose.yml  Tier 1 local dev (Postgres 17 + backend + frontend)
render.yaml         Render Blueprint for the Tier 2 backend -- see Tier 2 for the critical "must use Blueprint flow" gotcha
docs/specifications/  architecture decision records and canonical specs
docs/research/         prior research reports (Alibaba Cloud blueprint, staged validation plan, Neon/Render/Cloudflare deep-dive)
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
4. Region for Alibaba resources specifically (Tier 3/4 only): **Singapore (ap-southeast-1)**.
   Do not use a mainland-China region under any circumstances -- this is an international
   product with no ICP filing. (This is unrelated to Tier 2's region choice below -- Tier 2
   runs on Neon/Render/Cloudflare, not Alibaba, and its region was chosen for a different
   reason: co-locating with where Neon happened to provision.)
</tooling_setup>

<execution_plan>
Execute the tiers below IN ORDER. Do not skip to Tier 3/4 without the owner explicitly
confirming Tier 1 and Tier 2 both pass their acceptance criteria -- this is the entire point
of the staged approach: prove the pipeline before spending money.

<tier id="1" name="local, DONE and proven">
`docker-compose.yml`, `Makefile`, and both `Dockerfile`s exist in the repository and are
proven working. If picking this up fresh, verify (don't redesign):
1. `cp .env.example .env` and fill in a real `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` if
   available (a placeholder is acceptable for this tier -- Google OAuth itself cannot be
   tested without a real client id and a real browser).
2. `make dev-up` -- starts Postgres, waits for health, runs migrations 01->06,08,09 in
   order (see Makefile comments for why 07 is skipped and why order matters -- app_writer
   does not exist until migration 01 completes), then starts backend+frontend.
3. `make dev-test` -- must show 55 backend tests and 12 frontend tests passing.
<acceptance>
`docker compose up` (via `make dev-up`) brings up the full stack from a clean checkout with
zero manual intervention beyond `.env` setup; `make dev-test` is fully green.
</acceptance>
</tier>

<tier id="2" name="free remote staging -- DONE and PROVEN LIVE">
Purpose: prove the CI/CD pipeline and a real managed-Postgres 15+ target work, at zero cost,
before any Alibaba spend. **This tier is complete.** Real Google login through the real
deployed frontend, through the real deployed backend, into the real Neon database, has been
manually verified end to end. What follows is the record of exactly how, corrected after
several real failures during the actual attempt -- read the failure notes, they are not
hypothetical.

**1. Neon.** Create a project (Postgres 18 -- Neon defaults to it; native `uuidv7()` is
confirmed real in PG18, though the schema still uses `gen_random_uuid()` and does not need
to change for this to work). Neon names its default database `neondb`, but this codebase
hardcodes `selfdev` everywhere -- create an additional database named `selfdev` in the same
project rather than renaming references throughout the code:
```sql
CREATE DATABASE selfdev;
```
Do **NOT** enable "Neon Auth" when creating the project. It is a full replacement for the
auth flow (Google would redirect to Neon's own hosted callback, not this backend; sessions
would live in a `neon_auth` schema tied to this specific Neon project) -- incompatible with
this app's already-built, already-tested, Google-Identity-Services + first-party-JWT auth
system, and it would tie auth to a specific database vendor, breaking portability to
Alibaba RDS at Tier 3/4.

**Migrations: use `scripts/reset-neon.sh`, not manual step-by-step.** This script exists
specifically because manual step-by-step migration once left the database in a silently
broken state: every SQL-file migration succeeded, but the one Python step
(`06_seed_catalog_and_ideals.py`, which populates the 25 qualities / 3 ideals) failed
silently mid-sequence during an unrelated DNS-troubleshooting session, and nothing caught
it -- `catalog_qualities`/`ideals` sat at 0 rows for a while before anyone checked counts
directly. `scripts/reset-neon.sh` runs the full DROP DATABASE -> CREATE DATABASE -> all 9
migration steps -> verifies the final counts (25 qualities, 3 ideals) itself and exits
non-zero if they don't match, so a partial failure is loud, not silent:
```bash
export NEON_ADMIN_URL="postgresql://neondb_owner:<password>@<host>-pooler.<region>.aws.neon.tech/selfdev?sslmode=require&channel_binding=require"
bash scripts/reset-neon.sh
```
Run this from a shell with real network access to Neon -- **do not** run it via
`docker compose exec postgres ...`. That specific combination (this project's local
Postgres container, on Docker Desktop, on WSL2) could not resolve Neon's external hostname
at all (`Temporary failure in name resolution`) -- a documented WSL2/Docker-Desktop DNS
interaction, not a Neon problem or a permanent architectural limitation of any container.
Running `psql`/`python3` directly from the WSL2 host (not inside any container) worked
reliably throughout; that's what this script assumes.

The `app_writer` role is created idempotently by migration 01 and is NOT dropped by
`scripts/reset-neon.sh`'s `DROP DATABASE` (roles are project-level in Postgres, not
database-level) -- so re-running the reset script does not require updating `DATABASE_URL`
anywhere afterward.

**2. Render -- backend.** WARNING: **`render.yaml` is only read if the service is created
via Dashboard -> New -> Blueprint** (pick the repo, Render parses the file automatically).
Creating a "New Web Service" manually and filling the form by hand ignores `render.yaml`
completely -- this was the actual cause of an earlier failed attempt, not anything wrong in
the YAML itself.

`render.yaml` already pins `PYTHON_VERSION=3.12.9` explicitly -- Render's default for newly
created services floats (`3.14.3` as of this writing) and this codebase is tested against
3.12; do not remove this pin without re-testing on whatever the new default is.
`psycopg2-binary>=2.9.12` (already in `requirements.txt`) has prebuilt wheels for 3.14 too,
if the pin is ever deliberately dropped.

After the Blueprint deploy, three env vars need real values in the Render dashboard (they
are `sync: false` in `render.yaml`, meaning "prompt for a value, never store in git"):
- `DATABASE_URL` -- the **pooled** Neon connection string (`-pooler` in the hostname), role
  `app_writer` (not `neondb_owner` -- the app must run as the least-privilege role, not the
  database owner), database `/selfdev` (not `/neondb`).
- `GOOGLE_CLIENT_ID` -- the real Google OAuth Web Client ID.
- `CORS_ORIGINS` -- a JSON array as a string, e.g. `["https://<cloudflare-worker-url>"]`.
  Confirmed live that `pydantic-settings` parses `list[str]` from an env var in exactly
  this format. Get the real Cloudflare URL from step 3 before setting this correctly -- a
  placeholder here (e.g. `["http://localhost:5173"]`) is fine as a first pass, but the
  frontend cannot successfully call the backend until this is the real deployed frontend
  origin (the browser blocks the request at the CORS layer before it reaches this backend
  at all).
`JWT_SECRET` is generated by Render automatically (`generateValue: true`) -- never put a
real value in git for this one.

Region is `ohio` (matches where Neon's compute happens to be provisioned --
backend<->database latency mattered more than matching the eventual Alibaba region here;
Alibaba Tier 3/4 is a separate, later migration, not something Tier 2's region choice needs
to anticipate).

**3. Cloudflare -- frontend. Read this carefully: it is NOT classic "Cloudflare Pages."**
As of 2026, Cloudflare's dashboard defaults new Git-connected static-site projects into a
unified **Workers + Static Assets** model (`npx wrangler deploy`, not the old
Framework-preset/Build-output-directory Pages UI). This is a real, current product
difference, not a stale assumption to route around -- build for this model directly.

Required: `frontend/wrangler.jsonc` (already in the repo):
```jsonc
{
  "name": "<must match the Cloudflare project name exactly, or Wrangler overrides it with a warning>",
  "compatibility_date": "<today's date at actual deploy time>",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```
`not_found_handling: "single-page-application"` is the *entire* SPA-routing fix needed --
it is a documented, official Cloudflare Workers Static Assets setting
(developers.cloudflare.com/workers/static-assets/routing/single-page-application/), and it
fully replaces the old Pages-era `_redirects` file mechanism.

**Do not create a `frontend/public/_redirects` file for this project.** One was created
early (for the classic-Pages assumption) and it broke the real deploy: Cloudflare's newer
validation rejects `/* /index.html 200`-style rules with `Invalid _redirects configuration:
... Infinite loop detected` (error code 100324) under this model. If you ever see that exact
error, the fix is to delete the file, not to edit its contents -- `wrangler.jsonc`'s
`not_found_handling` already fully covers this SPA's routing needs and the two mechanisms
conflict.

Dashboard setup: Connect the repo; set **Path** to `frontend` (the monorepo subfolder --
this label is not directly documented by Cloudflare under this exact name as far as this
project could confirm, but it behaved exactly like a standard "root directory" field in
practice -- the build genuinely ran from `frontend/` and correctly found `wrangler.jsonc`
and `dist/` there); **Build command** must explicitly inline the `VITE_`-prefixed values,
because **the dashboard's separate "Variable name/Variable value" fields are Worker RUNTIME
bindings (`env.VAR` in server-side Worker code), not build-time values** -- a real,
documented, easy-to-miss distinction in this model. Neither value here is actually secret
(a Google OAuth Client ID is inherently public; the backend's URL is not sensitive), so
inlining them directly in the build command is the correct, simple fix, not a workaround:
```
VITE_API_BASE_URL=<real Render backend URL>/v1 VITE_GOOGLE_CLIENT_ID=<real client id> npm run build
```
Deploy command: leave as `npx wrangler deploy` (default).

**4. CORS callback.** Once the real Cloudflare URL exists, go back to Render and update
`CORS_ORIGINS` to the real value -- this is a required manual round-trip, not optional
cleanup, since Tier 2's acceptance criterion (a real end-to-end user flow) cannot pass with
a placeholder CORS origin.

**5. Google OAuth origin.** Add the real Cloudflare URL as an Authorized JavaScript Origin
on the same Google OAuth Client ID (console.cloud.google.com -> APIs & Services ->
Credentials -> the Client ID -> Authorized JavaScript origins -> Add). `localhost:5173`
(Tier 1) stays registered alongside it -- this adds an origin, it does not replace one.
Propagation can take a few minutes; an immediate retry failing right after saving is not
necessarily a new problem.

<acceptance>
MET. A `git push` to `main` auto-deploys both Render (backend) and Cloudflare (frontend); a
real Google login through the real deployed frontend, through the real deployed backend,
into the real Neon database, was manually completed end to end (login -> onboarding -> log
an action -> view statistics) on 2026-08-27.
</acceptance>
CONFIRM WITH OWNER before proceeding to Tier 3 -- this is the last free tier.
</tier>

<tier id="3" name="Alibaba Cloud trial - exact target stack">
Purpose: rehearse the EXACT production topology on Alibaba's free trial before it becomes a
paid deployment. A card is required for account registration; trial resources should not
generate charges if released before expiry -- but READ THE COST WARNING below first.
**This tier has not been started as of this writing.**

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
   built-in function on Alibaba's specific kernel before assuming it does; the app
   currently uses `gen_random_uuid()` and that does not need to change until this is
   confirmed). Whitelist the ECS instance's internal/private IP, not a public endpoint.
4. Apply migrations via `scripts/reset-neon.sh` logic adapted to this target (the script is
   Neon-specific in its DROP/CREATE-DATABASE step, which assumes a `neondb` system database
   exists for the admin connection to land on during the drop -- adjust that one step for
   Alibaba's actual system database name; the 9-migration sequence itself is
   provider-agnostic), run from the ECS instance (internal network path).
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
- Never run migration `09_remove_is_relevant.sql` or `08_migrate_and_cutover.sql` (or
  `scripts/reset-neon.sh`, which drops the whole database) against a database containing
  real user data without a fresh backup taken immediately before.
- Never select a mainland-China Alibaba Cloud region.
- Never create `frontend/public/_redirects` -- see Tier 2 step 3.
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
