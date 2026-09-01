#!/usr/bin/env bash
set -euo pipefail

# Полный чистый пересев Neon с нуля -- удобно после отладочных сессий, когда
# неясно, в каком именно состоянии осталась база. Именно это произошло
# 27.08.2026: все SQL-миграции (01-05,08,09) прошли успешно, а Python-шаг
# 06 тихо упал где-то посреди борьбы с DNS -- и это обнаружилось только
# явной проверкой count(). set -e здесь не формальность: если ЛЮБОЙ шаг
# упадёт, скрипт останавливается СРАЗУ с понятной ошибкой, а не продолжает
# молча, как это было при копировании команд по одной вручную.
#
# Список и порядок самих миграций живёт в scripts/apply-migrations.sh --
# общий с Makefile и CI. Этот файл отвечает только за то, что специфично
# для Neon: пересоздание базы с нуля и финальную проверку результата.
#
# Запуск: NEON_ADMIN_URL="postgresql://neondb_owner:...@...-pooler..../selfdev?sslmode=require&channel_binding=require" bash scripts/reset-neon.sh
# Обязательно из корня репозитория (пути к database/*.sql относительные).
# Обязательно через bash, не sh -- используется bash-синтаксис.

if [ -z "${NEON_ADMIN_URL:-}" ]; then
  echo "Ошибка: переменная NEON_ADMIN_URL не задана." >&2
  echo 'Пример: export NEON_ADMIN_URL="postgresql://neondb_owner:...@...-pooler..../selfdev?sslmode=require&channel_binding=require"' >&2
  exit 1
fi

if [ ! -f "database/01_schema_v2_multitenant_BASE.sql" ]; then
  echo "Ошибка: не вижу database/01_....sql -- запусти из корня репозитория." >&2
  exit 1
fi

echo "==> Пересоздаю базу selfdev с нуля..."
# DROP/CREATE DATABASE нельзя выполнить, будучи подключённым к ЭТОЙ ЖЕ базе --
# подключаемся к системной neondb, которая существует в любом Neon-проекте.
ADMIN_ROOT_URL=$(echo "$NEON_ADMIN_URL" | sed 's#/selfdev#/neondb#')
psql "$ADMIN_ROOT_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS selfdev;"
psql "$ADMIN_ROOT_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE selfdev;"
# Роль app_writer НЕ удаляется дропом базы (роли -- на уровне проекта, не
# базы) -- пароль, который уже вписан в Render, останется рабочим.

DSN="$NEON_ADMIN_URL" bash scripts/apply-migrations.sh

echo "==> Проверка результата..."
QUALITIES_COUNT=$(psql "$NEON_ADMIN_URL" -t -A -c "SELECT count(*) FROM catalog_qualities")
IDEALS_COUNT=$(psql "$NEON_ADMIN_URL" -t -A -c "SELECT count(*) FROM ideals")
echo "    catalog_qualities: $QUALITIES_COUNT (ожидается 169)"
echo "    ideals: $IDEALS_COUNT (ожидается 3)"

# 169 -- полный "Цветок духовных качеств" (миграция 12), не MVP-набор из
# 25. Число сверяется с тем же инвариантом, что и в
# backend/tests/test_catalog_ideals.py: расхождение означает, что сид
# молча потерял или задвоил качества. Раньше здесь оставалось 25 -- то
# есть после успешного применения ВСЕХ миграций скрипт всё равно упал бы
# на проверке, и это выглядело бы как сбой миграции, хотя всё прошло верно.
if [ "$QUALITIES_COUNT" != "169" ] || [ "$IDEALS_COUNT" != "3" ]; then
  echo "ВНИМАНИЕ: числа не совпадают с ожидаемыми -- несмотря на то что все команды формально прошли без ошибок." >&2
  exit 1
fi

echo "==> Готово. Чистый сид с нуля подтверждён на 100%: весь пайплайн миграций отработал за один проход."
