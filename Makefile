.PHONY: dev-up dev-migrate dev-down dev-reset dev-test dev-logs dev-status

# -include (not include): don't hard-fail if .env doesn't exist yet (e.g.
# before the user has run `cp .env.example .env`). export: makes every
# variable from .env a real environment variable in every recipe's shell --
# without this, "$$APP_WRITER_PASSWORD" below would silently see nothing
# (docker compose reads .env for ITS OWN interpolation; that does not
# automatically leak into the host shell make itself runs commands in).
-include .env
export

# Tier 1 local dev, in the ONLY order that works: Postgres has to be not
# just running but MIGRATED before backend can connect -- app_writer (the
# role backend/app/db.py connects as) doesn't exist until
# database/01_schema_v2_multitenant_BASE.sql runs. Starting everything at
# once races backend against an unmigrated, roleless database.
#
# .sql files run via the `postgres` service (psql); .py seed scripts run
# via the `backend` service (it already has psycopg2 from requirements.txt) --
# both mount ./database read-only, see docker-compose.yml.

dev-up:
	docker compose up -d postgres
	@echo "Waiting for Postgres..."
	@until docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done
	$(MAKE) dev-migrate
	docker compose up -d --build backend frontend
	@echo "Backend:  http://127.0.0.1:8000"
	@echo "Frontend: http://127.0.0.1:5173"

# Список и порядок миграций живут в scripts/apply-migrations.sh (общий с
# CI и scripts/reset-neon.sh) -- здесь только КАК их выполнить в Docker:
# .sql через `postgres` (есть psql, нет python3), .py-сид через `backend`
# (наоборот). Один контейнер не может выполнить весь список сам, поэтому
# способ выполнения передаётся снаружи, а список -- общий.
#
# MSYS_NO_PATHCONV=1 -- обязателен на Windows (Git Bash/MSYS2, тот самый
# MINGW64 в приглашении). Без него MSYS сам переписывает любой аргумент,
# похожий на Unix-путь ("/database/...") в Windows-путь относительно
# каталога установки Git ("C:/Program Files/Git/database/..."), даже
# когда этот путь на самом деле предназначен для файловой системы ВНУТРИ
# Linux-контейнера, где он абсолютно корректен -- реально ловили эту
# ошибку живьём ("No such file or directory" на пути с "C:/Program
# Files/Git" внутри). На Linux/macOS эта переменная просто ничего не значит.
dev-migrate:
	MSYS_NO_PATHCONV=1 \
	PSQL_CMD="docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f" \
	PY_CMD="docker compose run --rm backend python3" \
	DB_PREFIX="/database" \
	  bash scripts/apply-migrations.sh
	@echo "Syncing app_writer password to APP_WRITER_PASSWORD from .env (01_...sql hardcodes a dev default; this makes the actual role match whatever .env says, instead of requiring the two to coincidentally agree)..."
	MSYS_NO_PATHCONV=1 docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -c "ALTER ROLE app_writer WITH PASSWORD '$${APP_WRITER_PASSWORD:-change_me_in_production}'"
	@echo "Migrations applied."

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f

# The one command to run whenever something seems stuck/stale, or after
# pulling code changes that touch a Dockerfile or a migration file. Plain
# `docker compose up` on top of an EXISTING container/volume does NOT pick
# up Dockerfile changes (images are cached) and does NOT re-apply anything
# to an already-migrated database (the pgdata volume persists across git
# branches, file replacements, and `docker compose down` without -v) --
# both of those are exactly what happened in the round that produced the
# "password authentication failed" / "python3 ENOENT" errors: the fix files
# were in place, but the running containers and the Postgres volume
# pre-dated them. `-v` below removes the named volume (pgdata) too --
# this deletes all local dev data, which is correct for Tier 1 (throwaway
# by design) but never run this against anything with data you want kept.
dev-reset:
	docker compose down -v --remove-orphans
	docker compose build --no-cache
	$(MAKE) dev-up

dev-test:
	docker compose exec backend pytest tests/ -v
	docker compose exec frontend npx vitest run

# Quick sanity check before debugging further: is the backend actually up,
# and can IT reach Postgres under its OWN configured credentials (the same
# password path pytest/the browser both depend on)?
dev-status:
	@echo "--- containers ---"
	docker compose ps
	@echo "--- backend /health ---"
	@curl -sf http://127.0.0.1:8000/health || echo "backend is NOT responding -- run: docker compose logs backend"
