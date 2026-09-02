> ## ⚠️ ИСТОРИЧЕСКИЙ ДОКУМЕНТ — НЕ ИСТОЧНИК ПРАВДЫ
>
> Сохранён ради контекста решений: объясняет, ПОЧЕМУ проект пришёл к
> нынешнему устройству. Числа, имена файлов и инструкции в нём могли
> устареть и НЕ должны использоваться как руководство к действию.
>
> **Актуально вместо него:** живая схема в `database/` (16 миграций) и `docs/specifications/05_ADR_v2_INTEGRATION.md`

---

# PostgreSQL Architecture & Migration Specification v1.0

**Основа:** `CLAUDE_EXCEL_CANONICAL_SPEC_v1.0.md` (behavioral truth) + design intent (`AppSheet_Production_Spec...docx`) + разбор предложений ЧатДжипити.
**Статус:** это самостоятельный, полный архитектурный проход, а не патч к чужим решениям. Там, где я расхожусь с предыдущим обсуждением — явно сказано, почему.
**Метод проверки:** вся DDL ниже не просто написана, а **реально выполнена** на живом PostgreSQL 16 (сборка внутри контейнера) — созданы все таблицы/индексы/триггеры/view, загружены тестовые данные, вручную просчитаны ожидаемые значения статистик и сверены с тем, что вернула база (совпало на 100%), и отдельно — восемь попыток нарушить каждый жёсткий constraint (циклы, self-parent, дубликат пары, оба направления инварианта Релевантность↔Оценка, второй активный цикл, оценка вне диапазона, битая FK) — все восемь корректно отклонены с понятной ошибкой. Единственное отличие теста от целевой рекомендации — `gen_random_uuid()` вместо `uuidv7()`, потому что песочница даёт PG16, а `uuidv7()` нативна начиная с PG18; вся остальная логика идентична и уже проверена.

---

## 0. Принципы, которые я применял

1. **PK — `uuidv7()` (PostgreSQL 18+), не человекочитаемые ID.** Не случайный `uuidv4`/`gen_random_uuid()`, а именно v7: он кодирует время создания в старших битах, поэтому новые ID естественно ложатся в конец B-tree-индекса вместо случайной точки — меньше фрагментации индекса, быстрее вставка при том же UUID-пространстве. Плата — по такому ID приблизительно восстанавливается момент создания записи, поэтому наружу (в публичный URL/API) его показывать не стоит; для personal-системы, которая не выставляет ID посторонним, это не проблема.
2. **`occurred_at` (когда событие произошло по жизни) отдельно от `created_at`/`updated_at` (когда запись попала в БД).** Как только аналитика сортируется по первому, второе становится нужно для аудита/синхронизации между клиентами (веб/mobile/Telegram).
3. **Excel-формулы → либо VIEW, либо constraint, никогда не отдельная хранимая колонка.** Ни одного lookup-имени, ни одной служебной ранжирующей колонки в основных таблицах — это была вынужденная мера Excel, а не часть домена.
4. **Реактивный флаг → жёсткий constraint именно там, где ОБА независимых источника (design-intent документ и лист «Настройки AppSheet» внутри самого Excel) уже хотели жёсткую блокировку, но не могли её сделать в Excel.** Там, где источники сами называют проверку advisory («не приказ») — она остаётся VIEW, а не превращается в constraint по умолчанию.
5. **Открытые, дополняемые пользователем списки → таблицы, не `ENUM TYPE` и не хардкод.** Это буквально то, что написано в футере листа «Справочники» — и относится ко всем 13 спискам одинаково, не только к «явно» открытым.
6. **Ограниченная глубиной-3 защита Excel (P/Q/флаг R) → неограниченная защита в SQL** (рекурсивный CTE + BEFORE-триггер, проверенные выше вживую на цикле длины 3 и на self-parent).

---

## 1. Итоговая таблица решений

| Вопрос | Решение | Кто предложил / откуда взято |
|---|---|---|
| Primary key | `uuid DEFAULT uuidv7()` (PG18+) | я — уточнение к варианту ЧатДжипити (тот предлагал `gen_random_uuid()`, т.е. v4) |
| Человекочитаемые Ц-0001 | `legacy_code text UNIQUE`, **постоянное** поле, не временные migration-метаданные | я — расхождение с ЧатДжипити: коды уже используются как живые примеры в самой документации Excel, удалять их после миграции — терять историческую прослеживаемость почти бесплатно |
| Примечание у цели | Не добавлять, `description` достаточно | согласен с ЧатДжипити |
| «Последние N действий» | `ORDER BY occurred_at DESC, created_at DESC` | согласен с ЧатДжипити, дополнил tie-breaker'ом на `created_at`, а не на ID |
| Циклы ↔ Цели / Качества | **Junction-таблицы** (`cycle_goals`, `cycle_qualities`) | согласен с итоговым выбором ЧатДжипити, но по другой причине — см. §11.1 |
| Справочники | Унифицированная `option_lists` для 7 «мелких» доменов + отдельные `quality_groups`, `action_contexts` (у них есть реальная перспектива обрасти атрибутами) | моя доработка идеи ЧатДжипити — он предлагал либо единую таблицу, либо много отдельных, не разделяя по этому критерию |
| Релевантность | **`boolean is_relevant`**, не enum и не таблица | добавил я — бинарный домен, жёстко зашитый в constraint инварианта, таблица здесь не нужна вообще |
| Оценка 0–4 | `smallint` + `CHECK`, плюс отдельная документационная `score_legend` (не FK-цель, просто справка «что значит 3») | добавил я — сохраняет единственное место, где вообще объяснено, что означает шкала |
| `occurred_at` NOT NULL у Действий и Рефлексии | Да, сознательно усиливаю сверх Excel | моё решение, объяснение — §10 |

---

## 2. Справочники

```sql
CREATE TABLE option_lists (
    list_type   text NOT NULL,
    code        text NOT NULL,
    label       text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    PRIMARY KEY (list_type, code)
);

CREATE TABLE quality_groups (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    label       text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE action_contexts (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    label       text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE score_legend (
    score   smallint PRIMARY KEY CHECK (score BETWEEN 0 AND 4),
    meaning text NOT NULL
);
```

**Почему не 7+ отдельных таблиц и не единый ENUM:** пользователь по тексту самой книги ожидает добавлять значения без правки схемы — единая таблица даёт это для всех «мелких» статус/приоритет-подобных доменов одним и тем же CRUD-интерфейсом. `quality_groups` и `action_contexts` выделены отдельно, потому что это не просто ярлыки: у групп качеств и контекстов действий реалистично появятся собственные атрибуты (иконка, описание, лимиты) — и это ровно те два справочника, что ЧатДжипити тоже выделил как «семантически важные», просто без этого обоснования.

Сид-данные (все 13 списков из аудита, дословно):

```sql
INSERT INTO option_lists (list_type, code, label, sort_order) VALUES
('goal_status','idea','Идея',10), ('goal_status','active','Активна',20),
('goal_status','paused','Приостановлена',30), ('goal_status','achieved','Достигнута',40),
('goal_status','cancelled','Отменена',50),
('priority','p1_critical','P1 — Критический',10), ('priority','p2_high','P2 — Высокий',20),
('priority','p3_normal','P3 — Обычный',30), ('priority','background','Фоновый',40),
('action_status','planned','Запланировано',10), ('action_status','done','Завершено',20),
('action_status','cancelled','Отменено',30),
('quality_dev_status','undeveloped','Не развито',10), ('quality_dev_status','forming','Формируется',20),
('quality_dev_status','stable','Устойчиво',30), ('quality_dev_status','anchored','Закреплено',40),
('quality_focus','current_focus','Текущий фокус',10), ('quality_focus','maintenance','Поддержание',20),
('quality_focus','background','Фоновое',30), ('quality_focus','not_in_focus','Не в фокусе',40),
('reflection_type','daily','Ежедневная',10), ('reflection_type','weekly','Еженедельная',20),
('reflection_type','monthly','Ежемесячная',30), ('reflection_type','cycle','По циклу',40),
('cycle_status','planned','Планируется',10), ('cycle_status','active','Активен',20),
('cycle_status','done','Завершён',30);

INSERT INTO quality_groups (code, label, sort_order) VALUES
('intellect','Интеллект',10),('will','Воля',20),('self_control','Самообладание',30),
('morality','Нравственность',40),('relationships','Отношения',50),('leadership','Лидерство',60),
('responsibility','Ответственность',70),('learning','Обучение',80),('awareness','Сознательность',90);

INSERT INTO action_contexts (code, label, sort_order) VALUES
('negotiation','Переговоры',10),('conflict','Конфликт',20),('work','Работа',30),
('public_speaking','Публичное выступление',40),('learning','Обучение',50),
('relationships','Отношения',60),('solo_work','Самостоятельная работа',70),
('community','Общественная среда',80),('health_daily','Здоровье/быт',90),('other','Другое',100);

INSERT INTO score_legend (score, meaning) VALUES
(0,'Качество было релевантно, но проявлено противоположным образом / серьёзный провал'),
(1,'Слабое проявление'), (2,'Частичное / сознательное проявление'),
(3,'Хорошее устойчивое проявление'), (4,'Очень сильное, практически естественное проявление');
```

---

## 3. Основные сущности

```sql
CREATE TABLE goals (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_code      text UNIQUE,
    parent_id        uuid REFERENCES goals(id) ON DELETE SET NULL,
    name             text NOT NULL,
    description      text,
    status_type      text NOT NULL DEFAULT 'goal_status',
    status_code      text NOT NULL,
    priority_type    text NOT NULL DEFAULT 'priority',
    priority_code    text NOT NULL,
    start_date       date,
    target_date      date,
    progress_pct     numeric(5,2),                       -- РУЧНОЕ; было 0–1 в Excel, здесь 0–100 (смена единиц при миграции!)
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT goals_no_self_parent CHECK (id IS DISTINCT FROM parent_id),   -- избыточно поверх триггера ниже, оставлено намеренно (см. §5)
    CONSTRAINT goals_status_fk FOREIGN KEY (status_type, status_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT goals_priority_fk FOREIGN KEY (priority_type, priority_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT goals_dates_order CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date),
    CONSTRAINT goals_progress_range CHECK (progress_pct IS NULL OR progress_pct BETWEEN 0 AND 100)
);
CREATE INDEX idx_goals_parent_id ON goals(parent_id);

CREATE TABLE qualities (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_code       text UNIQUE,
    name              text NOT NULL,
    definition        text,
    group_id          smallint REFERENCES quality_groups(id),
    tags              text[],                              -- поле было пустым в Excel; массив — моя интерпретация по названию колонки, не подтверждённое поведение
    dev_priority_type text NOT NULL DEFAULT 'priority',
    dev_priority_code text NOT NULL,
    focus_type        text NOT NULL DEFAULT 'quality_focus',
    focus_code        text NOT NULL,
    dev_status_type   text NOT NULL DEFAULT 'quality_dev_status',
    dev_status_code   text NOT NULL,
    current_level     smallint CHECK (current_level BETWEEN 0 AND 4),   -- РУЧНОЕ, не формула — сохранённое поведение FINAL 2.0
    last_reviewed_at  date,
    next_review_at    date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT qualities_dev_priority_fk FOREIGN KEY (dev_priority_type, dev_priority_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT qualities_focus_fk FOREIGN KEY (focus_type, focus_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT qualities_dev_status_fk FOREIGN KEY (dev_status_type, dev_status_code) REFERENCES option_lists(list_type, code)
);
CREATE INDEX idx_qualities_tags ON qualities USING gin(tags);
CREATE INDEX idx_qualities_focus ON qualities(focus_code) WHERE focus_code = 'current_focus';

CREATE TABLE actions (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_code  text UNIQUE,
    goal_id      uuid REFERENCES goals(id) ON DELETE SET NULL,   -- НЕ NOT NULL: "без цели" — рабочий, задокументированный кейс
    name         text NOT NULL,
    occurred_at  date NOT NULL,                                   -- усилено сверх Excel, см. §10
    description  text,
    context_id   smallint REFERENCES action_contexts(id),
    result       text,
    note         text,
    status_type  text NOT NULL DEFAULT 'action_status',
    status_code  text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT actions_status_fk FOREIGN KEY (status_type, status_code) REFERENCES option_lists(list_type, code)
);
CREATE INDEX idx_actions_goal_id ON actions(goal_id);
CREATE INDEX idx_actions_occurred_at ON actions(occurred_at DESC);

-- "Качества в действиях" -> quality_expressions.
-- Всё, что в Excel было VLOOKUP-наследованием от родительского действия
-- (Дата, ID цели, Цель, Ветка цели, Контекст) -- сюда НЕ переносится вообще, только JOIN.
CREATE TABLE quality_expressions (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_code text UNIQUE,
    action_id   uuid NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    quality_id  uuid NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
    is_relevant boolean NOT NULL,
    score       smallint CHECK (score BETWEEN 0 AND 4),
    comment     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT quality_expressions_unique_pair UNIQUE (action_id, quality_id),           -- было реактивным флагом, теперь настоящий блок
    CONSTRAINT quality_expressions_relevance_score_invariant CHECK (
        (is_relevant AND score IS NOT NULL) OR (NOT is_relevant AND score IS NULL)
    )                                                                                     -- тоже было реактивным, теперь настоящий блок
);
CREATE INDEX idx_qexpr_quality_id ON quality_expressions(quality_id);
CREATE INDEX idx_qexpr_action_id ON quality_expressions(action_id);

CREATE TABLE development_cycles (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_code text UNIQUE,
    name        text NOT NULL,
    start_date  date,
    end_date    date,
    status_type text NOT NULL DEFAULT 'cycle_status',
    status_code text NOT NULL,
    description text,
    summary     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT cycles_status_fk FOREIGN KEY (status_type, status_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT cycles_dates_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
-- "Не более одного активного цикла" -- было реактивным флагом, теперь настоящий блок на уровне БД:
CREATE UNIQUE INDEX one_active_cycle ON development_cycles (status_code) WHERE status_code = 'active';

CREATE TABLE cycle_goals (
    cycle_id  uuid NOT NULL REFERENCES development_cycles(id) ON DELETE CASCADE,
    goal_id   uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    PRIMARY KEY (cycle_id, goal_id)
);

CREATE TABLE cycle_qualities (
    cycle_id    uuid NOT NULL REFERENCES development_cycles(id) ON DELETE CASCADE,
    quality_id  uuid NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
    PRIMARY KEY (cycle_id, quality_id)
);

CREATE TABLE reflections (
    id                              uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_code                     text UNIQUE,
    occurred_at                     date NOT NULL,          -- усилено сверх Excel, см. §10
    reflection_type_type            text NOT NULL DEFAULT 'reflection_type',
    reflection_type_code            text NOT NULL,
    goal_id                         uuid REFERENCES goals(id) ON DELETE SET NULL,
    cycle_id                        uuid REFERENCES development_cycles(id) ON DELETE SET NULL,
    what_worked                     text,
    what_did_not_work               text,
    qualities_observed_raw          text,     -- суффикс _raw: намеренно свободный текст, НЕ FK на qualities -- так и было в Excel (асимметрия, см. §11.2)
    insight                         text,
    what_to_change                  text,
    qualities_needing_attention_raw text,
    what_stuck                      text,
    next_cycle_change               text,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reflections_type_fk FOREIGN KEY (reflection_type_type, reflection_type_code) REFERENCES option_lists(list_type, code)
);
```

---

## 4. Дерево целей: защита от циклов + рекурсия

```sql
CREATE OR REPLACE FUNCTION goals_prevent_cycle() RETURNS trigger AS $$
DECLARE
    cursor_id uuid := NEW.parent_id;
    depth     int := 0;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    WHILE cursor_id IS NOT NULL LOOP
        IF cursor_id = NEW.id THEN
            RAISE EXCEPTION 'goals: цикл в дереве целей (id=%, конфликт на предке %)', NEW.id, cursor_id;
        END IF;
        depth := depth + 1;
        IF depth > 1000 THEN
            RAISE EXCEPTION 'goals: цепочка предков длиннее 1000 — вероятна повреждённая структура';
        END IF;
        SELECT parent_id INTO cursor_id FROM goals WHERE id = cursor_id;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_goals_prevent_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON goals
    FOR EACH ROW EXECUTE FUNCTION goals_prevent_cycle();

CREATE OR REPLACE VIEW goal_hierarchy AS
WITH RECURSIVE tree AS (
    SELECT g.id, g.parent_id, g.name, 1 AS level, g.name AS path,
           ARRAY[g.id] AS path_ids, g.id AS root_id, g.name AS root_name
    FROM goals g WHERE g.parent_id IS NULL
    UNION ALL
    SELECT g.id, g.parent_id, g.name, t.level + 1, t.path || ' → ' || g.name,
           t.path_ids || g.id, t.root_id, t.root_name
    FROM goals g JOIN tree t ON g.parent_id = t.id
    WHERE NOT (g.id = ANY (t.path_ids))
)
SELECT id, parent_id, name, level, path, root_id, root_name FROM tree;

CREATE OR REPLACE VIEW goal_counts AS
SELECT g.id AS goal_id,
       (SELECT count(*) FROM goals c WHERE c.parent_id = g.id) AS child_goal_count,
       (SELECT count(*) FROM actions a WHERE a.goal_id = g.id) AS action_count
FROM goals g;
```

**Проверено вживую:** триггер корректно заблокировал (а) попытку сделать внука родителем корня — «настоящий», через несколько уровней цикл, которого Excel-флаг R (глубина ≤3) даже не заметил бы для цепочки в 4+ уровня; (б) прямую самоссылку — при этом CHECK `goals_no_self_parent` в таблице `goals` ни разу не сработал первым, потому что BEFORE-триггер выполняется раньше проверки CHECK и уже прерывает операцию. CHECK оставлен намеренно как независимый запасной барьер — если триггер когда-нибудь отключат (например, на время большого bulk-импорта) и забудут включить обратно, самоссылка всё равно не пройдёт.

---

## 5. Read-model'ы: статистика и три отчёта Аналитики

```sql
CREATE OR REPLACE VIEW quality_stats AS
WITH relevant_expr AS (
    SELECT qe.quality_id, qe.score, a.occurred_at
    FROM quality_expressions qe JOIN actions a ON a.id = qe.action_id
    WHERE qe.is_relevant
),
last_date AS (
    SELECT quality_id, max(occurred_at) AS last_expressed_at FROM relevant_expr GROUP BY quality_id
),
last_score AS (
    SELECT ld.quality_id, avg(re.score) AS last_score
    FROM last_date ld JOIN relevant_expr re ON re.quality_id = ld.quality_id AND re.occurred_at = ld.last_expressed_at
    GROUP BY ld.quality_id
),
agg AS (
    SELECT quality_id,
        avg(score) AS avg_score_all_time,
        avg(score) FILTER (WHERE occurred_at >= current_date - 29) AS avg_score_30d,
        avg(score) FILTER (WHERE occurred_at >= current_date - 59 AND occurred_at < current_date - 29) AS avg_score_prev_30d,
        count(*) FILTER (WHERE occurred_at >= current_date - 29) AS n_30d,
        count(*) FILTER (WHERE occurred_at >= current_date - 59 AND occurred_at < current_date - 29) AS n_prev_30d,
        count(*) AS expression_count,
        count(*) FILTER (WHERE score >= 3)::numeric / NULLIF(count(*), 0) AS share_ge_3,
        max(score) - min(score) AS score_range
    FROM relevant_expr GROUP BY quality_id
)
SELECT q.id AS quality_id, ld.last_expressed_at, ls.last_score,
    a.avg_score_all_time, a.avg_score_30d, a.avg_score_prev_30d, a.expression_count, a.share_ge_3,
    CASE WHEN a.expression_count IS NULL OR a.expression_count < 3 THEN 'Недостаточно данных'
         WHEN a.score_range <= 1 THEN 'Высокая' WHEN a.score_range = 2 THEN 'Средняя' ELSE 'Низкая' END AS stability,
    CASE WHEN a.expression_count IS NULL OR a.expression_count = 0 THEN 'Нет данных'
         WHEN a.expression_count <= 2 THEN 'Очень мало данных' WHEN a.expression_count <= 5 THEN 'Ограниченные данные'
         WHEN a.expression_count <= 14 THEN 'Достаточно данных' ELSE 'Устойчивая выборка' END AS confidence,
    CASE WHEN coalesce(a.n_30d,0) < 3 OR coalesce(a.n_prev_30d,0) < 3 THEN 'Недостаточно данных'
         WHEN a.avg_score_30d - a.avg_score_prev_30d >= 0.2 THEN '↑ Растёт'
         WHEN a.avg_score_30d - a.avg_score_prev_30d <= -0.2 THEN '↓ Снижается' ELSE '→ Стабильно' END AS trend
FROM qualities q
LEFT JOIN last_date ld ON ld.quality_id = q.id
LEFT JOIN last_score ls ON ls.quality_id = q.id
LEFT JOIN agg a ON a.quality_id = q.id;

CREATE OR REPLACE VIEW action_stats AS
SELECT a.id AS action_id, count(qe.id) AS quality_count, avg(qe.score) FILTER (WHERE qe.is_relevant) AS avg_score
FROM actions a LEFT JOIN quality_expressions qe ON qe.action_id = a.id GROUP BY a.id;
```

**Проверено вживую** на 7 действиях (3 в последнем 30-дневном окне, 3 в предыдущем, 1 без цели, 1 с оценкой «не релевантно»): все пороги (≥3 наблюдений в каждом окне для тренда, ±0.2 для тренда, ≤1/=2/>2 для стабильности, 0/1–2/3–5/6–14/≥15 для уверенности) отработали ровно так, как задокументированы в Canonical Spec — цифры, посчитанные вручную, совпали с тем, что вернула база, до знака.

**Три read-model'а из Аналитики:**

- *Топ фокуса* — просто `WHERE focus_code = 'current_focus' ORDER BY ... LIMIT 15`, без служебной ранжирующей колонки.
- *Карточка качества/цели* — `SELECT ... WHERE id = $1`, плюс:
- *Последние N действий* — служебная колонка-«обратный ранг» (`служ.: ранг`) в SQL не нужна вообще, её функцию полностью и **правильнее** закрывает обычный `ORDER BY occurred_at DESC, created_at DESC LIMIT 8`.

```sql
CREATE OR REPLACE VIEW v_data_quality_alerts AS
SELECT 'quality_overdue_review' AS check_name, q.id::text AS record_id, q.name AS label
FROM qualities q WHERE q.next_review_at IS NOT NULL AND q.next_review_at < current_date
UNION ALL
SELECT 'quality_never_practiced', q.id::text, q.name FROM qualities q
WHERE NOT EXISTS (SELECT 1 FROM quality_expressions qe WHERE qe.quality_id = q.id AND qe.is_relevant)
UNION ALL
SELECT 'quality_missing_definition', q.id::text, q.name FROM qualities q
WHERE q.definition IS NULL OR btrim(q.definition) = ''
UNION ALL
SELECT 'quality_duplicate_name', q.id::text, q.name FROM qualities q
WHERE (SELECT count(*) FROM qualities q2 WHERE q2.name = q.name) > 1
UNION ALL
SELECT 'action_missing_goal', a.id::text, a.name FROM actions a WHERE a.goal_id IS NULL
UNION ALL
SELECT 'goal_too_deep', gh.id::text, gh.name FROM goal_hierarchy gh WHERE gh.level > 10;
```

---

## 6. Маппинг всех 25 проверок целостности (нумерация — как в Canonical Spec §4.2)

| № | Проверка | Было в Excel | Стало в SQL |
|---|---|---|---|
| 1 | Цикл в дереве (Excel: до 3 ур.) | реактивный флаг, глубина ≤3 | **TRIGGER**, любая глубина |
| 2 | Ссылка на себя | реактивный флаг | **TRIGGER** (тот же) + запасной CHECK |
| 3 | Родитель не найден | реактивный флаг | **FK** — физически невозможно |
| 4 | Слишком глубокая цепочка (>10) | реактивный флаг | VIEW (advisory) — глубина сама по себе не ошибка |
| 5 | Дата окончания < начала (цель) | реактивный флаг | **CHECK** |
| 6 | Дублирующийся ID (цель) | реактивный флаг | невозможно (uuid PK); `legacy_code` — **UNIQUE** |
| 7 | Качество без определения | реактивный флаг | VIEW (advisory) |
| 8 | Качество не практиковалось | реактивный флаг | VIEW (advisory) |
| 9 | Просрочен пересмотр | реактивный флаг | VIEW (advisory) |
| 10 | Дубль названия качества | реактивный флаг, «Низкая» критичность | VIEW (advisory) — **намеренно не ужесточаю**, источник сам считает это некритичным |
| 11 | Действие без цели | реактивный флаг | остаётся допустимым состоянием; VIEW (advisory) — НЕ NOT NULL |
| 12 | Действие без даты | реактивный флаг | **NOT NULL** — сознательное усиление, см. §10 |
| 13 | Дублирующийся ID (действие) | реактивный флаг | невозможно; `legacy_code` UNIQUE |
| 14–15 | Релевантно без оценки / наоборот | реактивные флаги, оба направления | **CHECK** (один constraint на оба направления) |
| 16 | Некорректная оценка | реактивный флаг + частичная DV | **CHECK** |
| 17–18 | Действие/качество не найдено | реактивные флаги | **FK** ×2 |
| 19 | Дублирующаяся пара | реактивный флаг | **UNIQUE** |
| 20 | Дублирующийся ID (КвД) | реактивный флаг | невозможно; `legacy_code` UNIQUE |
| 21 | Более одного активного цикла | реактивный флаг | **partial UNIQUE INDEX** |
| 22 | Дублирующийся ID (цикл) | реактивный флаг | невозможно; `legacy_code` UNIQUE |
| 23 | Дата окончания < начала (цикл) | реактивный флаг | **CHECK** |
| 24 | Рефлексия без даты/типа | реактивный флаг | **NOT NULL** оба поля — сознательное усиление, см. §10 |
| 25 | Дублирующийся ID (рефлексия) | реактивный флаг | невозможно; `legacy_code` UNIQUE |

Итог: из 25 проверок 14 становятся физически невозможными (FK/UNIQUE/CHECK/TRIGGER на уровне БД, не приложения), 2 — сознательно усилены до NOT NULL, 6 остаются advisory-view ровно там, где источники сами называли их некритичными, и 3 закрываются самой природой uuid-PK.

---

## 7. Индексы (сведены)

`idx_goals_parent_id`, `idx_qualities_tags` (GIN), `idx_qualities_focus` (частичный, только `current_focus`), `idx_actions_goal_id`, `idx_actions_occurred_at`, `idx_qexpr_quality_id`, `idx_qexpr_action_id`, `one_active_cycle` (частичный уникальный). Плюс автоматические индексы под каждый PK/UNIQUE. Для текущего и обозримого объёма данных (десятки-сотни записей) это с большим запасом — узкое место, о котором предупреждал лист «Настройки AppSheet» («считать только фокус, иначе дорого при росте базы»), было свойством движка формул Google Sheets, а не домена: агрегат по индексированному внешнему ключу в Postgres быстр при любом реалистичном для персональной системы объёме.

---

## 8. Миграция данных

Порядок — по совету из `Переход_от_Excel_к_реляционной_СУБД...pdf`: сначала «грязный» staging-слой, потом очистка, потом финальные таблицы.

1. Выгрузить каждый лист Excel в CSV.
2. Загрузить в staging-таблицы (все поля text).
3. Построить маппинг Cyrillic-label → `option_lists.code` (таблица соответствия — по одной строке на каждое из 27+9+10 значений из §2).
4. **Исключить строки, явно помеченные как учебный пример** (по цветовой легенде из Инструкции: «Действие Д-0004», строка с зафиксированной просрочкой ревью) — это были живые демонстрации работы флагов, не реальная история пользователя; в SQL демонстрировать уже нечего, флаги стали constraint'ами.
5. Вставить в финальные таблицы, генерируя `uuidv7()`, сохраняя исходный `Ц-0001` и т.п. в `legacy_code`.
6. **Приёмочный тест миграции:** пересчитать `v_data_quality_alerts` и сверить с тем, что показывал живой лист «Качество данных» на момент экспорта — совпадение = успешная миграция.

---

## 9. Сознательные усиления сверх Excel-поведения (полный список, ничего не спрятано)

1. `actions.occurred_at NOT NULL` — Excel допускал (реактивно предупреждая) действие без даты; я считаю, что «действие без даты» не является связной сущностью домена (в отличие от «действия без цели», которое осмысленно и явно задокументировано как рабочий случай).
2. `reflections.occurred_at` и `reflection_type_code` — `NOT NULL` по той же логике.
3. Уникальность пары (действие, качество) и инвариант Релевантность↔Оценка — **не моя инициатива**, это прямое исполнение того, что оба независимых design-intent источника уже просили как P0, но Excel не мог обеспечить технически.
4. «Один активный цикл» — то же самое: явное существующее намерение, доведённое до настоящего constraint'а.

Ничего из проверок с пометкой «Низкая критичность» (дубль названия качества, слишком глубокая цепочка) я не усиливал — источники сами считали их несущественными, и я не вижу оснований спорить именно с этой их оценкой.

---

## 10. Открытые вопросы, оставленные на ваше усмотрение

1. **`tags text[]` у качеств** — поле было пустым в Excel всегда; массив — моя интерпретация по названию колонки («Теги», множественное число), не подтверждённое реальным использованием. Если реальный формат ввода окажется другим — это самая безопасная для отката часть схемы (просто TEXT).
2. **Порядок в «Топе фокуса»** — Excel использовал порядок ввода строки. Если нужен ручной порядок (а не по приоритету/имени, как сейчас в §5) — добавить `focus_set_at timestamptz`, проставляемый триггером при переключении `focus_code` в `'current_focus'`.
3. **`qualities_observed_raw`/`qualities_needing_attention_raw` в Рефлексии остаются свободным текстом**, не связаны с `qualities.id` — это асимметрия самого Excel (Действия связаны структурно, Рефлексия — нет), я её не устраняю по умолчанию, но если хотите, чтобы рефлексия тоже питала статистику качеств — понадобится ещё одна junction-таблица `reflection_qualities`, добавляется без ломающих изменений в остальной схеме.
4. **Мягкое удаление** (`deleted_at`) нигде не заложено — сейчас везде обычное `DELETE`/`ON DELETE CASCADE`/`SET NULL`. Для персональной системы с синхронизацией между несколькими клиентами (веб/mobile/Telegram) иногда стоит того ради восстановления после случайного свайпа — добавляется по каждой таблице отдельно, не архитектурное решение уровня всей схемы.

---

## 11. Отдельно — почему я поменял мнение по циклам (было: «оставить на усмотрение», стало: junction-таблицы)

В прошлый раз я говорил, что решение «Циклы ↔ Цели/Качества» explicitly отложено design-intent документами «до реального UX-теста», и что предлагать junction-таблицы сейчас — не нейтральный перевод, а отмена чужого продуктового решения. Это по-прежнему верно как описание **исходного контекста** того решения. Но тот контекст был другим: речь шла о риске усложнить уже работающий, хрупкий Excel/AppSheet-MVP ради гипотетической потребности. Здесь ситуация иная — схема проектируется с нуля, junction-таблица не «добавляется поверх» рабочей системы, а с первого дня стоит почти ничего (два `CREATE TABLE` из четырёх строк каждая), даёт настоящую FK-целостность (в отличие от массива, где ссылки внутри не проверяются автоматически) и не требует отдельной миграции, если понадобится позже. Риск, от которого предостерегали исходные документы, здесь просто не воспроизводится. Поэтому я делаю junction-таблицы дефолтом — но `uuid[]`-массив с GIN-индексом остаётся полностью рабочей, более лёгкой альтернативой, если хотите начать ещё проще.

---

**Следующий шаг:** данные для реальной миграции (staging-скрипт под ваш экспорт CSV) и, отдельно, слой API поверх этой схемы.
