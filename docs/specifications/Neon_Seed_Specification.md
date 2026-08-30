# Guidelines: Seeding Neon Database from Docker/WSL

> **Обновлено 27.08.2026 по факту реальной проверки.** Исходная версия этого документа
> (Docker AI Gordon) была практически правильной, но с двумя неточностями, которые
> проявились на практике — обе исправлены ниже. Канонический, протестированный способ
> теперь — `scripts/reset-neon.sh`, а не ручной прогон команд по этому файлу; этот
> документ остаётся как объяснение, почему скрипт устроен именно так.

## Problem
When seeding an external Neon cloud database from Docker containers running in WSL2, direct
`docker compose exec postgres psql` commands can fail because the container cannot resolve
Neon's external hostname (`Temporary failure in name resolution`).

**Уточнение причины (не было в исходной версии):** это не структурное ограничение именно
контейнера `postgres` — это задокументированное поведение Docker Desktop на WSL2 (DNS внутри
WSL2-дистрибутива иногда ломается при старте Docker Desktop или после сна компьютера;
см. известные issue в microsoft/WSL и docker/for-win). Локальный Compose-сеть между
`postgres`/`backend`/`frontend` по именам сервисов при этом продолжает работать — ломается
именно резолюция ВНЕШНИХ хостов, и это может задеть любой контейнер в системе, не только
`postgres`.

## Solution: Split Commands by Tool

### Rule 1: SQL via psql → Run from WSL Host
**Not from inside containers.** Проверено на практике многократно — стабильно работает.

✗ **DON'T:**
```bash
docker compose exec postgres psql "$NEON_URL" -f /database/schema.sql
```

✓ **DO:**
```bash
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/01_schema.sql
```

### Rule 2: Python-шаг (06) — ТОЖЕ с хоста WSL, не через контейнер

**Исправлено (в исходной версии здесь была рекомендация использовать `backend`-контейнер —
это и стало реальной причиной инцидента):**

```bash
pip3 install psycopg2-binary --break-system-packages   # один раз
SEED_DSN="$NEON_URL" python3 database/06_seed_catalog_and_ideals.py
```

**Почему это исправлено, а не просто предпочтение:** прогон через
`docker compose exec -e SEED_DSN=... backend python3 ...` один раз тихо провалился —
все SQL-миграции (01–05, 08, 09) отработали успешно, а этот единственный Python-шаг не
выполнился (сеть контейнера в тот момент была нестабильна по той же WSL2/Docker Desktop
причине), и это не было заметно сразу: скрипт не упал с ошибкой, которую кто-то увидел бы
в интерактивной сессии, копирующей команды одну за другой — просто следующие команды
продолжили выполняться. `catalog_qualities`/`ideals` остались на 0 строк до тех пор, пока
это не проверили явно через `SELECT count(*)`. Хост WSL оказался надёжнее контейнера на
всём протяжении отладки — поэтому теперь единая рекомендация: и SQL, и Python — с хоста.

### Rule 3: Check Connection String Format
Neon provides two connection pool types:

- **Direct**: `postgresql://[user]:[REDACTED]@[host]/[db]?sslmode=require&channel_binding=require`
- **Pooler**: `postgresql://[user]:[REDACTED]@[host]-pooler.<region>.aws.neon.tech/[db]?sslmode=require&channel_binding=require`

Для миграций (роль `neondb_owner`, разовые операции) годится любой из двух — на практике
использовался pooler-эндпоинт без проблем. Для самого приложения (роль `app_writer`,
долгоживущий пул psycopg2) — тоже pooler, но см. `backend/app/db.py` про pre-ping/retry:
Neon обрывает простаивающие pooled-соединения при autosuspend, и это учтено в коде.

If connection fails with auth error, the password may have expired. Reset in Neon Console.

---

## Рекомендованный способ теперь: `scripts/reset-neon.sh`

Вместо ручного прогона команд по этому файлу — используй проверенный скрипт, который делает
DROP/CREATE базы, все 9 шагов миграций по порядку и сам сверяет результат (25 качеств,
3 идеала), падая с понятной ошибкой, если что-то не сошлось:
```bash
export NEON_ADMIN_URL="postgresql://neondb_owner:<пароль>@<host>-pooler.<region>.aws.neon.tech/selfdev?sslmode=require&channel_binding=require"
bash scripts/reset-neon.sh
```
Ручные команды ниже остаются как справочная информация и для частичных операций (например,
если нужно перезапустить только один конкретный шаг).

## Complete Manual Workflow (справочно; предпочтительно использовать scripts/reset-neon.sh)

```bash
export NEON_URL="postgresql://neondb_owner:[REDACTED]@ep-xxx-pooler.<region>.aws.neon.tech/selfdev?sslmode=require&channel_binding=require"

psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/01_schema_v2_multitenant_BASE.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/02_security_gate_migration.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/03_google_auth_migration.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/04_seed_reference_data.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/05_catalog_ideals_schema.sql

SEED_DSN="$NEON_URL" python3 database/06_seed_catalog_and_ideals.py

psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/08_migrate_and_cutover.sql
psql "$NEON_URL" -v ON_ERROR_STOP=1 -f ./database/09_remove_is_relevant.sql

psql "$NEON_URL" -c "ALTER ROLE app_writer WITH PASSWORD 'secure_password_here'"

# Обязательно проверить результат явно -- молчаливый частичный провал уже случался один раз:
psql "$NEON_URL" -c "SELECT count(*) FROM catalog_qualities; SELECT count(*) FROM ideals;"
# Ожидается: 25 и 3
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `psql: command not found` | psql CLI not installed in WSL | `sudo apt-get install postgresql-client` |
| `python3: can't open file '.../06_...py'` | Запущено не из корня репозитория | `cd` в корень репозитория (пути к `database/` относительные) |
| `password authentication failed` | Wrong password in connection string | Reset password in Neon Console; verify it matches exactly |
| `Temporary failure in name resolution` | Запущено из контейнера, не с хоста WSL | Запускай `psql`/`python3` напрямую с хоста, не через `docker compose exec` |
| `fe_sendauth: no password supplied` | Явно указан `host=...` в DSN вместо использования дефолта/pooled-строки с паролем | Используй полную connection string с паролем, не `host=127.0.0.1 user=...` без пароля |
| Каталог/идеалы после миграции показывают 0 | Шаг 06 тихо провалился (см. выше) | Перезапустить `SEED_DSN="$NEON_URL" python3 database/06_seed_catalog_and_ideals.py` с хоста, затем явно проверить count() |

---

## Key Takeaways

1. **Всё — с хоста WSL**, не через контейнеры (и SQL, и Python) — так надёжнее на практике.
2. **`scripts/reset-neon.sh`** — предпочтительный способ, не ручной прогон по одной команде.
3. **Всегда проверяй результат явно** (`SELECT count(*)`) — не полагайся на «команда не выдала ошибку» как на доказательство успеха.
4. **Relative paths** when running from repo root (`./database/...`).
