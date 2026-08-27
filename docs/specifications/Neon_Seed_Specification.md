Script for WSL migration created in /scripts

# Guidelines: Seeding Neon Database from Docker/WSL

## Problem
When seeding an external Neon cloud database from Docker containers running in WSL2, direct `docker compose exec postgres psql` commands fail because the `postgres` container doesn't have network access to Neon — it only knows the local Docker network (`host=postgres`).

## Solution: Split Commands by Tool

### Rule 1: SQL via psql → Run from WSL Host
**Not from inside containers.** The `postgres` service container has no psql CLI or Neon network access.

✗ **DON'T:**
```bash
docker compose exec postgres psql "$NEON_URL" -f /database/schema.sql
```

✓ **DO:**
```bash
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/01_schema.sql
```

**Why:** psql CLI must run on the machine with Neon network access (WSL host). Run from repo root; use relative paths (`./database/...`).

---

### Rule 2: Python/App Logic via Backend Container → Run from Docker
The `backend` service has your app code and Python interpreter.

```bash
docker compose exec -e SEED_DSN="$NEON_URL" backend python3 /database/06_seed_catalog_and_ideals.py
```

**Why:** App-level seeding logic lives inside the container; pass Neon URL as env var (`-e SEED_DSN=...`).

---

### Rule 3: Check Connection String Format
Neon provides two connection pool types:

- **Direct**: `postgresql://[user]:[REDACTED]@[host]/[db]?sslmode=require&channel_binding=require`
  - Use for: Python, backend containers
- **Pooler**: `postgresql://[user]:[REDACTED]@[host]-pooler.c-4.us-east-2.aws.neon.tech/[db]?sslmode=require`
  - Use for: psql CLI (more stable for short-lived connections)

If connection fails with auth error, the password may have expired. Reset in Neon Console.

---

## Complete Workflow

```bash
# 1. Start containers (local postgres for dev, backend for app logic)
docker compose up -d postgres backend

# 2. Export Neon connection string
export NEON_URL="postgresql://neondb_owner:[REDACTED]@ep-xxx.c-4.us-east-2.aws.neon.tech/selfdev?sslmode=require&channel_binding=require"

# 3. Run SQL migrations from WSL (psql = host machine)
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/01_schema.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/02_security.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/03_auth.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/04_reference_data.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/05_catalog.sql

# 4. Run Python seeding from backend container
docker compose exec -e SEED_DSN="$NEON_URL" backend python3 /database/06_seed_catalog_and_ideals.py

# 5. Run final SQL migrations from WSL
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/08_migrate_and_cutover.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/09_remove_is_relevant.sql

# 6. Set app password
psql "$NEON_URL" -c "ALTER ROLE app_writer WITH PASSWORD 'secure_password_here'"
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `psql: command not found` | psql CLI not installed in WSL | `sudo apt-get install postgresql-client` |
| `password authentication failed` | Wrong password in connection string | Reset password in Neon Console; verify it matches exactly |
| `cannot attach stdin to a TTY` | Using `-it` flags with `docker compose exec` in non-interactive shell | Remove `-it` flags; use just `docker compose exec` |
| `connection refused` / `no route to host` | Running psql from inside a container | Run psql from WSL host instead; containers have no Neon network access |

---

## Key Takeaways

1. **SQL → Host** (psql runs on your machine, not in containers)
2. **App Logic → Container** (Python runs inside backend service)
3. **Both connect to same Neon** (same connection string, different executors)
4. **No docker compose exec postgres psql** (postgres service can't reach Neon)
5. **Relative paths** when running from repo root (`./database/...`)
6. **Environment variables** for passing secrets to containers (`-e SEED_DSN=...`)
