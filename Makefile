.PHONY: dev-up dev-migrate dev-down dev-test dev-logs

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
	docker compose up -d backend frontend
	@echo "Backend:  http://127.0.0.1:8000"
	@echo "Frontend: http://127.0.0.1:5173"

dev-migrate:
	@echo "Applying migrations 01-06, 08-09 (07 is optional, real-Excel-only -- run manually if needed)..."
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/01_schema_v2_multitenant_BASE.sql
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/02_security_gate_migration.sql
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/03_google_auth_migration.sql
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/04_seed_reference_data.sql
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/05_catalog_ideals_schema.sql
	docker compose run --rm backend python3 /database/06_seed_catalog_and_ideals.py
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/08_migrate_and_cutover.sql
	docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f /database/09_remove_is_relevant.sql
	@echo "Migrations applied."

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f

dev-test:
	docker compose exec backend pytest tests/ -v
	docker compose exec frontend npx vitest run
