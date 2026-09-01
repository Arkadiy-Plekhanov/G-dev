#!/usr/bin/env bash
set -euo pipefail

# Единственный источник правды о том, какие миграции существуют и в каком
# порядке -- используется Makefile'ом (локальная разработка, через
# docker compose exec), .github/workflows/test.yml (CI, прямой psql) и
# scripts/reset-neon.sh (Neon, прямой psql). Появился именно потому, что
# раньше этот список был продублирован в трёх местах отдельно: добавление
# миграции 10 (именованная шкала роста) обновило только одно из них --
# Makefile и CI остались со старым списком, `qualities.py` стал ссылаться
# на колонки, которых не было в их базах, и всё сломалось молча, до первого
# реального использования. Теперь добавление новой миграции -- это правка
# только этого файла.
#
# Способ выполнения команд подставляется снаружи, а не зашит здесь: у
# Makefile'а это docker compose exec (у контейнера postgres есть psql, но
# нет python3; у backend наоборот) -- один контейнер не может выполнить
# весь список сам. Поэтому здесь -- только СПИСОК и ПОРЯДОК; сами команды
# принимаются как переменные окружения:
#
#   PSQL_CMD -- как выполнить "psql ... -f <файл>"; получает путь к файлу
#               миграции последним аргументом. По умолчанию: прямой psql
#               с $DSN (CI, Neon, WSL host).
#   PY_CMD   -- как выполнить "python3 database/06_....py". По умолчанию:
#               прямой python3 (CI, Neon, WSL host).
#
# Пример для CI/Neon (прямой psql, DSN уже настроен на хосте):
#   DSN="postgresql://..." bash scripts/apply-migrations.sh
# Пример для Makefile (через Docker, см. Makefile):
#   PSQL_CMD="docker compose exec -T postgres psql -U postgres -d selfdev -v ON_ERROR_STOP=1 -f" \
#   PY_CMD="docker compose run --rm backend python3" \
#     bash scripts/apply-migrations.sh

if [ ! -f "database/01_schema_v2_multitenant_BASE.sql" ]; then
  echo "Ошибка: не вижу database/01_....sql -- запусти из корня репозитория." >&2
  exit 1
fi

if [ -z "${PSQL_CMD:-}" ]; then
  if [ -z "${DSN:-}" ]; then
    echo "Ошибка: нужен либо DSN (для дефолтного psql), либо явный PSQL_CMD." >&2
    exit 1
  fi
  PSQL_CMD="psql $DSN -v ON_ERROR_STOP=1 -f"
fi
PY_CMD="${PY_CMD:-python3}"
# database/ здесь -- префикс путей ВНЕ контейнера (для дефолтного случая);
# Makefile передаёт свой PSQL_CMD/PY_CMD уже настроенными на /database
# внутри контейнеров -- см. DB_PREFIX в Makefile.
DB_PREFIX="${DB_PREFIX:-database}"

# На свежем томе (после `docker compose down -v` / `make dev-reset`)
# официальный образ postgres поднимает ВРЕМЕННЫЙ сервер только для
# инициализационных скриптов, останавливает его и лишь потом стартует
# основной. И ручная проверка pg_isready, и штатный Docker healthcheck
# могут поймать именно этот временный сервер и посчитать Postgres готовым --
# а первая же реальная команда после этого падает с
# "FATAL: the database system is shutting down", потому что временный
# сервер уже завершает работу, а основной ещё не поднялся. Это не связано
# с содержимым конкретной миграции -- чистая гонка по времени на первом
# старте, и она проходит сама за несколько секунд. Решение то же, что и
# для засыпающего по бездействию Neon в backend/app/db.py: не пытаться
# угадать точный момент, а перетерпеть кратковременный сбой подключения
# ретраем, а не падать с первой попытки. Если после всех попыток команда
# так и не прошла -- это уже не гонка, а настоящая ошибка, и она покажется
# как обычно.
run_step() {
  local attempt=1 max_attempts=10 delay=2
  while true; do
    if eval "$1"; then
      return 0
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "Не прошло после $max_attempts попыток -- похоже, это настоящая ошибка, не временная." >&2
      return 1
    fi
    echo "Не прошло (попытка $attempt/$max_attempts) -- вероятно, Postgres ещё завершает первичную инициализацию. Повтор через ${delay}с..." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

# Порядок -- часть контракта, не переставлять. 07 сознательно пропущена
# (опциональна, только для переноса конкретных исторических данных Excel).
MIGRATIONS=(
  "01_schema_v2_multitenant_BASE.sql"
  "02_security_gate_migration.sql"
  "03_google_auth_migration.sql"
  "04_seed_reference_data.sql"
  "05_catalog_ideals_schema.sql"
  "06_seed_catalog_and_ideals.py"
  "08_migrate_and_cutover.sql"
  "09_remove_is_relevant.sql"
  "10_named_growth_scale.sql"
  "12_seed_full_catalog.py"
  "13_add_goal_reflection_type.sql"
  "14_expose_goal_path_ids.sql"
  "15_reflection_action_link.sql"
)

for m in "${MIGRATIONS[@]}"; do
  if [[ "$m" == *.py ]]; then
    # Любой .py в списке -- сид, не миграция схемы: определяем по
    # РАСШИРЕНИЮ файла, а не по отдельному сигнальному имени на каждый
    # скрипт -- иначе добавление N-го python-сида требует править ветвление
    # здесь заново, а не только сам список (ровно так был упущен 12-й при
    # первой правке этого файла: обработали только один частный случай
    # "__PYTHON_SEED__", а 12-й, названный иначе, тихо попал в SQL-ветку и
    # psql пытался открыть его как файл миграции).
    echo "==> $m (Python)..."
    if [ -n "${DSN:-}" ] && [ "$PY_CMD" = "python3" ]; then
      # Дефолтный путь (CI/Neon/WSL host) -- сид-скрипты без SEED_DSN
      # подключаются через peer-аутентификацию (дефолт для локальной
      # разработки в песочнице), что не совпадает с $DSN.
      run_step "SEED_DSN=$DSN $PY_CMD $DB_PREFIX/$m"
    else
      # Makefile передаёт свой PY_CMD (docker compose run backend python3),
      # тот контейнер уже получает SEED_DSN через docker-compose.yml.
      run_step "$PY_CMD $DB_PREFIX/$m"
    fi
  else
    echo "==> $m..."
    run_step "$PSQL_CMD $DB_PREFIX/$m"
  fi
done

echo "==> Все миграции применены."
