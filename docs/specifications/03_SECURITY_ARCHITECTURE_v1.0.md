# PostgreSQL Security Architecture v1.0

**Статус:** Security Gate (этап 0 roadmap) пройден. Ниже — не план, а описание того, что реально применено к живой схеме и проверено вживую (миграция `security_gate_migration.sql`, набор `backend/tests/test_security_gate.py`, 13/13 зелёных).

## Identity
`users.id` (uuid) — единственный источник идентичности. На MVP — email+bcrypt; при переходе на Google-only (roadmap, этап 1) заменяется на `google_sub`, сама модель ownership ниже не меняется.

## Ownership
Каждая пользовательская строка несёт `user_id`. До этой миграции `quality_expressions`, `cycle_goals`, `cycle_qualities` принадлежность выводили только косвенно (через `action_id`/`cycle_id`) — теперь у всех восьми таблиц `user_id` хранится явно и участвует в composite FK.

## RLS — что где включено
Все восемь пользовательских таблиц: `goals, qualities, actions, quality_expressions, development_cycles, cycle_goals, cycle_qualities, reflections`.
- `ENABLE ROW LEVEL SECURITY` — было.
- **`FORCE ROW LEVEL SECURITY`** — добавлено этой миграцией. Без FORCE политики не действуют на владельца таблицы; наши таблицы принадлежат `postgres`, а не `app_writer`, но FORCE ставится безусловно, не полагаясь на то, кто именно будет подключаться в будущем.
- Политика единого вида на всех восьми: `USING/WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid)`. Второй аргумент `true` у `current_setting` — fail-closed: не установлен контекст → `NULL` → сравнение с `user_id` никогда не истинно → 0 строк (проверено тестом 9).
- `users` **намеренно без RLS** — таблица идентичности требует lookup по email до аутентификации (login), RLS создал бы курицу-и-яйцо. Защищена точностью запросов на уровне приложения (`WHERE email=$1` на login, `WHERE id=$current_user` на me), не содержит чужих персональных доменных данных.

## Cross-user integrity — composite ownership FK
Найдено эмпирически (и подтверждено официальной документацией PostgreSQL, раздел о Row Security Policies): **проверки внешних ключей всегда обходят RLS** — это официально описанный «covert channel», а не баг конкретной схемы. Реактивный триггер, добавленный раньше как временная затычка, заменён декларативными composite FK `(user_id, id)`:

| Дочерняя таблица | Composite FK | ON DELETE |
|---|---|---|
| `goals.parent_id` | → `goals(user_id, id)` | (нет каскада — самоссылка) |
| `actions.goal_id` | → `goals(user_id, id)` | `SET NULL (goal_id)` — точечно, PG15+ |
| `quality_expressions.action_id` | → `actions(user_id, id)` | `CASCADE` |
| `quality_expressions.quality_id` | → `qualities(user_id, id)` | `CASCADE` |
| `cycle_goals.cycle_id` / `.goal_id` | → `development_cycles`/`goals(user_id, id)` | `CASCADE` |
| `cycle_qualities.cycle_id` / `.quality_id` | → `development_cycles`/`qualities(user_id, id)` | `CASCADE` |
| `reflections.goal_id` / `.cycle_id` | → `goals`/`development_cycles(user_id, id)` | `SET NULL (col)` |

`ON DELETE SET NULL (col)` — важная деталь: с обычным `SET NULL` на составном ключе Postgres пытается занулить обе колонки, включая `user_id` (NOT NULL) → ошибка; форма с явным списком колонок (PG15+) зануляет только нужную.

**Что это устранило конкретно:** до фикса пользователь A мог создать `quality_expression`, ссылающийся на `quality` пользователя B (эмпирически подтверждено на этой же БД). Теперь оба FK ссылаются на **тот же** `quality_expressions.user_id` — значит `action.user_id`, `qe.user_id` и `quality.user_id` физически обязаны совпасть, иначе один из двух FK не пройдёт.

**Побочный найденный канал:** VIEW (`quality_stats`, `goal_hierarchy` и др.) по умолчанию выполняются с правами создателя, что тоже обходит RLS вызывающей роли — независимо от FK-канала. Эмпирически подтверждено: до фикса пустой пользователь видел 7 чужих строк в `quality_stats` и 8 в `goal_hierarchy`. Закрыто через `ALTER VIEW ... SET (security_invoker = true)` (PG15+) на всех пяти VIEW.

## Privileges
`app_writer` — единственная роль приложения. `rolbypassrls = false`, `rolsuper = false` (проверено вживую через `pg_roles`). Не владеет таблицами (владелец — `postgres`), поэтому не имеет DDL. `SELECT/INSERT/UPDATE/DELETE` на пользовательских таблицах, только `SELECT` на глобальных справочниках и VIEW.

## Functions/triggers
Единственный триггер — `goals_prevent_cycle` (обычный, без `SECURITY DEFINER`; выполняется с правами вызывающего). Обнаруживает циклы **любой глубины** в дереве целей — единственное, что FK физически не может выразить (граф, не прямая ссылка). Удалённый триггер `quality_expressions_same_owner` стал избыточен: то же самое теперь гарантирует declarative composite FK, что надёжнее (не зависит от того, не забудут ли триггер при будущем рефакторинге). `SECURITY DEFINER` в проекте не используется нигде — соответствующего риска нет.

## Test matrix — 13/13 пройдено
`backend/tests/test_security_gate.py`, два независимых пользователя на фикстуру, реальные подключения под `app_writer`:

| № | Тест | Результат |
|---|---|---|
| 1–3 | Чтение/изменение/удаление чужой строки | PASSED |
| 4–5 | expression: свой action + чужой quality (и наоборот) | PASSED |
| 6 | `parent_id` → чужая цель | PASSED |
| 7 | Чужая цель в своём цикле | PASSED |
| 8 | Рефлексия → чужой цикл | PASSED |
| 9 | Запрос без `SET LOCAL app.current_user_id` | PASSED |
| 10 | Подделка `user_id` в INSERT | PASSED |
| 11 | Утечка через JOIN | PASSED |
| 12 | Утечка через VIEW | PASSED |
| 13 | Контроль: легитимная запись проходит | PASSED |

`pytest tests/test_security_gate.py -v` → `13 passed`.

## Дополнительно проверено после миграции (сквозной HTTP-прогон через реальный FastAPI-процесс)
register → login → /me → создать цель → создать качество → создать действие → добавить проявление качества → GET качества (реальная статистика из `quality_stats`, `security_invoker`) → GET целей (реальные `level`/`path` из `goal_hierarchy`) → инвариант «не релевантно + оценка» корректно отклонён (422, понятное сообщение). Composite FK не сломали ни один существующий эндпоинт — единственная правка кода: `add_expression` теперь передаёт `user_id` в INSERT (колонка появилась этой миграцией).

## Что осознанно НЕ входит в этот гейт
Google OAuth (этап 1), реструктуризация `qualities` → каталог+`user_qualities` (этап 2), rate limiting и секрет-менеджмент прод-окружения (этап 5) — по плану roadmap, каждый гейт закрывает свой периметр, не больше.
