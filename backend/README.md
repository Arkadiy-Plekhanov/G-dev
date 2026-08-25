# Backend — Личная система развития

FastAPI + PostgreSQL. Соответствует спецификациям и миграциям из этого же пакета (`03_database/`).

## Запуск с нуля (проверено на чистой виртуальной машине)

```bash
# 1. Схема + сид, строго по порядку:
psql "$DATABASE_URL" -f 01_schema_v2_multitenant_BASE.sql
psql "$DATABASE_URL" -f 02_security_gate_migration.sql
psql "$DATABASE_URL" -f 03_google_auth_migration.sql
psql "$DATABASE_URL" -f 04_seed_reference_data.sql
psql "$DATABASE_URL" -f 05_catalog_ideals_schema.sql
python3 06_seed_catalog_and_ideals.py     # от имени владельца БД (postgres), не app_writer -- см. комментарий в файле
# опционально, только при переносе реальных данных из исходного Excel:
python3 07_migrate_excel_data.py
psql "$DATABASE_URL" -f 08_migrate_and_cutover.sql   # обязателен даже без Excel-данных
psql "$DATABASE_URL" -f 09_remove_is_relevant.sql    # ADR-001

# 2. Бэкенд
cd backend
make setup   # venv + pip install -r requirements.txt, с нуля
make test    # 49 passed -- проверено на чистом окружении перед поставкой
make run
```

Переменные окружения перед `make run` в проде (dev-заглушки не годятся):
`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`.

## Структура

```
app/
  config.py       - настройки из переменных окружения
  db.py           - пул соединений (maxconn=30) + RLS-контекст (SET LOCAL app.current_user_id)
  security.py     - bcrypt (зарезервирован под будущие методы входа) + JWT + refresh-токены
  google_auth.py  - верификация Google ID token (официальная google-auth)
  schemas.py      - Pydantic-модели запросов/ответов
  deps.py         - текущий пользователь из JWT + инъекция Google-верификатора (для тестов)
  errors.py       - доменные коды ошибок ({"code": "...", "message": "..."}), перевод constraint violations
  main.py         - точка входа, роутеры под /v1, CORS
  routers/
    auth.py        - /v1/auth/google, /v1/auth/refresh, /v1/auth/logout, /v1/me, /v1/me/export, DELETE /v1/me
    goals.py         - /v1/goals (CRUD + дерево), /v1/goals/{id}/overview (карточка цели)
    qualities.py      - /v1/qualities (личный набор), /v1/qualities/{id}/overview (карточка качества)
    catalog.py          - /v1/catalog/qualities, /v1/catalog/ideals (глобальный каталог, read-only)
    onboarding.py         - /v1/onboarding/adopt-ideal (путь "идеал" построения фокуса)
    actions.py              - /v1/actions (курсорная пагинация), /v1/actions/with-qualities (атомарно), expressions
    cycles.py                 - /v1/cycles (CRUD, атомарно с goal_ids/quality_ids, один активный на пользователя)
    reflections.py              - /v1/reflections (CRUD)
    analytics.py                  - /v1/analytics/current-focus, /v1/analytics/data-quality-alerts
tests/
  test_security_gate.py       - 13 cross-tenant attack-тестов
  test_auth_google.py         - 7 тестов Google-входа и ротации refresh-токенов
  test_refresh_concurrency.py - конкурентный тест ротации (20 параллельных refresh -> ровно 1 успешный)
  test_catalog_ideals.py      - 7 тестов каталога/идеалов/путей построения фокуса
  test_atomic_action.py       - 5 тестов атомарного создания действия с проявлениями качеств
  test_stage3_api.py          - 15 тестов: циклы, рефлексия, read-model карточки, экспорт/удаление, пагинация, коды ошибок
```

**49/49 тестов зелёные**, проверено с абсолютно чистого venv (`make setup && make test`) и живым HTTP-прогоном на реальных исторических данных владельца.

## Stage 3: полный API v1 — что добавлено

- **Циклы развития и рефлексия** — полный CRUD. Циклы создаются атомарно с привязкой целей/качеств (`goal_ids`/`quality_ids` в теле запроса, та же транзакция); «один активный цикл на пользователя» отдаёт понятный код `ONE_ACTIVE_CYCLE_ALREADY_EXISTS`, а не сырую ошибку Postgres.
- **Три read-model карточки**, спроектированные ещё в самом первом forensic-аудите исходного Excel (лист «Аналитика») и наконец реализованные:
  - `GET /goals/{id}/overview` — цель + последние 8 действий + качества, проявившиеся под этой целью, со сравнением средней оценки «в рамках цели» со средней «вообще» (порог ±0.3 — та же формула, что была в оригинальном Excel).
  - `GET /qualities/{id}/overview` — качество + статистика + последние 8 проявлений + разбивка по контексту действия.
  - `GET /analytics/current-focus` — лидерборд текущего фокуса.
- **`GET /analytics/data-quality-alerts`** — то, что осталось advisory после Security Gate (не блокирующие проверки вроде «просрочен пересмотр» или «действие без цели»).
- **`GET /me/export` и `DELETE /me`** — право на экспорт и полное удаление (GDPR ст. 17/20). Удаление проверено вживую: удаляется одна строка `users`, всё остальное (цели, качества, действия, проявления, циклы, рефлексии, refresh-токены) уходит каскадом через `ON DELETE CASCADE` — не предположено, а подтверждено тестом.
- **Курсорная пагинация на `/actions`** — `before_occurred_at` + `before_created_at`, тот же тай-брейк, что и в основной сортировке ленты; `limit` теперь жёстко ограничен (1–100).
- **Доменные коды ошибок** — весь API отдаёт `{"code": "...", "message": "..."}` вместо сырых сообщений Postgres. Таблица соответствия имён constraint'ов кодам — в `errors.py`.

## Важные находки прошлых поставок (кратко)

Refresh-ротация имела реальную гонку (исправлено `SELECT ... FOR UPDATE`, воспроизведено и закрыто тестом). `requirements.txt` был неполным для тестов (`httpx`, `requests`) — поймано именно прогоном на чистом venv. `is_relevant` удалена из `quality_expressions` (ADR-001) — существование записи уже означает релевантность. Подробности — в `ADR_001_remove_is_relevant.md` и `AUTH_ARCHITECTURE_v1.0.md`.
