-- ============================================================
-- 0. Пользователи
-- ============================================================
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- PG18+: uuidv7()
    email          citext NOT NULL UNIQUE,
    password_hash  text NOT NULL,
    display_name   text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 1. Глобальные справочники (общие для всех пользователей, без RLS)
-- ============================================================
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

-- ============================================================
-- 2. Цели (per-user)
-- ============================================================
CREATE TABLE goals (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_code      text,
    parent_id        uuid REFERENCES goals(id) ON DELETE SET NULL,
    name             text NOT NULL,
    description      text,
    status_type      text NOT NULL DEFAULT 'goal_status',
    status_code      text NOT NULL,
    priority_type    text NOT NULL DEFAULT 'priority',
    priority_code    text NOT NULL,
    start_date       date,
    target_date      date,
    progress_pct     numeric(5,2),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT goals_no_self_parent CHECK (id IS DISTINCT FROM parent_id),
    CONSTRAINT goals_status_fk FOREIGN KEY (status_type, status_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT goals_priority_fk FOREIGN KEY (priority_type, priority_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT goals_dates_order CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date),
    CONSTRAINT goals_progress_range CHECK (progress_pct IS NULL OR progress_pct BETWEEN 0 AND 100)
);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_parent_id ON goals(parent_id);
CREATE UNIQUE INDEX uq_goals_user_legacy ON goals(user_id, legacy_code) WHERE legacy_code IS NOT NULL;

-- ============================================================
-- 3. Качества (per-user)
-- ============================================================
CREATE TABLE qualities (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_code       text,
    name              text NOT NULL,
    definition        text,
    group_id          smallint REFERENCES quality_groups(id),
    tags              text[],
    dev_priority_type text NOT NULL DEFAULT 'priority',
    dev_priority_code text NOT NULL,
    focus_type        text NOT NULL DEFAULT 'quality_focus',
    focus_code        text NOT NULL,
    dev_status_type   text NOT NULL DEFAULT 'quality_dev_status',
    dev_status_code   text NOT NULL,
    current_level     smallint CHECK (current_level BETWEEN 0 AND 4),
    last_reviewed_at  date,
    next_review_at    date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT qualities_dev_priority_fk FOREIGN KEY (dev_priority_type, dev_priority_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT qualities_focus_fk FOREIGN KEY (focus_type, focus_code) REFERENCES option_lists(list_type, code),
    CONSTRAINT qualities_dev_status_fk FOREIGN KEY (dev_status_type, dev_status_code) REFERENCES option_lists(list_type, code)
);
CREATE INDEX idx_qualities_user_id ON qualities(user_id);
CREATE INDEX idx_qualities_tags ON qualities USING gin(tags);
CREATE INDEX idx_qualities_focus ON qualities(user_id, focus_code) WHERE focus_code = 'current_focus';
CREATE UNIQUE INDEX uq_qualities_user_legacy ON qualities(user_id, legacy_code) WHERE legacy_code IS NOT NULL;

-- ============================================================
-- 4. Действия (per-user)
-- ============================================================
CREATE TABLE actions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_code  text,
    goal_id      uuid REFERENCES goals(id) ON DELETE SET NULL,
    name         text NOT NULL,
    occurred_at  date NOT NULL,
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
CREATE INDEX idx_actions_user_id ON actions(user_id);
CREATE INDEX idx_actions_goal_id ON actions(goal_id);
CREATE INDEX idx_actions_occurred_at ON actions(user_id, occurred_at DESC);
CREATE UNIQUE INDEX uq_actions_user_legacy ON actions(user_id, legacy_code) WHERE legacy_code IS NOT NULL;

-- ============================================================
-- 5. Качества в действиях -> quality_expressions
--    Без своего user_id: принадлежность выводится из action_id (RLS ниже через подзапрос)
-- ============================================================
CREATE TABLE quality_expressions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_code text,
    action_id   uuid NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    quality_id  uuid NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
    is_relevant boolean NOT NULL,
    score       smallint CHECK (score BETWEEN 0 AND 4),
    comment     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT quality_expressions_unique_pair UNIQUE (action_id, quality_id),
    CONSTRAINT quality_expressions_relevance_score_invariant CHECK (
        (is_relevant AND score IS NOT NULL) OR (NOT is_relevant AND score IS NULL)
    )
);
CREATE INDEX idx_qexpr_quality_id ON quality_expressions(quality_id);
CREATE INDEX idx_qexpr_action_id ON quality_expressions(action_id);

-- ============================================================
-- 6. Циклы развития (per-user) + junction-таблицы
-- ============================================================
CREATE TABLE development_cycles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_code text,
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
CREATE INDEX idx_cycles_user_id ON development_cycles(user_id);
-- "не более одного активного цикла" -- теперь на пользователя, не на всю таблицу:
CREATE UNIQUE INDEX one_active_cycle_per_user ON development_cycles (user_id) WHERE status_code = 'active';

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

-- ============================================================
-- 7. Рефлексия (per-user)
-- ============================================================
CREATE TABLE reflections (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_code                     text,
    occurred_at                     date NOT NULL,
    reflection_type_type            text NOT NULL DEFAULT 'reflection_type',
    reflection_type_code            text NOT NULL,
    goal_id                         uuid REFERENCES goals(id) ON DELETE SET NULL,
    cycle_id                        uuid REFERENCES development_cycles(id) ON DELETE SET NULL,
    what_worked                     text,
    what_did_not_work               text,
    qualities_observed_raw          text,
    insight                         text,
    what_to_change                  text,
    qualities_needing_attention_raw text,
    what_stuck                      text,
    next_cycle_change               text,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reflections_type_fk FOREIGN KEY (reflection_type_type, reflection_type_code) REFERENCES option_lists(list_type, code)
);
CREATE INDEX idx_reflections_user_id ON reflections(user_id);

-- ============================================================
-- 8. Дерево целей: защита от циклов + одного владельца + рекурсия
-- ============================================================
CREATE OR REPLACE FUNCTION goals_prevent_cycle() RETURNS trigger AS $$
DECLARE
    cursor_id uuid := NEW.parent_id;
    depth     int := 0;
    parent_owner uuid;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT user_id INTO parent_owner FROM goals WHERE id = NEW.parent_id;
    IF parent_owner IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'goals: родительская цель принадлежит другому пользователю';
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
    BEFORE INSERT OR UPDATE OF parent_id, user_id ON goals
    FOR EACH ROW EXECUTE FUNCTION goals_prevent_cycle();

CREATE OR REPLACE VIEW goal_hierarchy AS
WITH RECURSIVE tree AS (
    SELECT g.id, g.user_id, g.parent_id, g.name, 1 AS level, g.name AS path,
           ARRAY[g.id] AS path_ids, g.id AS root_id, g.name AS root_name
    FROM goals g WHERE g.parent_id IS NULL
    UNION ALL
    SELECT g.id, g.user_id, g.parent_id, g.name, t.level + 1, t.path || ' → ' || g.name,
           t.path_ids || g.id, t.root_id, t.root_name
    FROM goals g JOIN tree t ON g.parent_id = t.id
    WHERE NOT (g.id = ANY (t.path_ids))
)
SELECT id, user_id, parent_id, name, level, path, root_id, root_name FROM tree;

CREATE OR REPLACE VIEW goal_counts AS
SELECT g.id AS goal_id,
       (SELECT count(*) FROM goals c WHERE c.parent_id = g.id) AS child_goal_count,
       (SELECT count(*) FROM actions a WHERE a.goal_id = g.id) AS action_count
FROM goals g;

-- ============================================================
-- 9. Статистика
-- ============================================================
CREATE OR REPLACE VIEW quality_stats AS
WITH relevant_expr AS (
    SELECT qe.quality_id, qe.score, a.occurred_at, q.user_id
    FROM quality_expressions qe
    JOIN actions a ON a.id = qe.action_id
    JOIN qualities q ON q.id = qe.quality_id
    WHERE qe.is_relevant
),
last_date AS (SELECT quality_id, max(occurred_at) AS last_expressed_at FROM relevant_expr GROUP BY quality_id),
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
SELECT q.id AS quality_id, q.user_id, ld.last_expressed_at, ls.last_score,
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
SELECT a.id AS action_id, a.user_id, count(qe.id) AS quality_count, avg(qe.score) FILTER (WHERE qe.is_relevant) AS avg_score
FROM actions a LEFT JOIN quality_expressions qe ON qe.action_id = a.id GROUP BY a.id, a.user_id;

CREATE OR REPLACE VIEW v_data_quality_alerts AS
SELECT q.user_id, 'quality_overdue_review' AS check_name, q.id::text AS record_id, q.name AS label
FROM qualities q WHERE q.next_review_at IS NOT NULL AND q.next_review_at < current_date
UNION ALL
SELECT q.user_id, 'quality_never_practiced', q.id::text, q.name FROM qualities q
WHERE NOT EXISTS (SELECT 1 FROM quality_expressions qe WHERE qe.quality_id = q.id AND qe.is_relevant)
UNION ALL
SELECT a.user_id, 'action_missing_goal', a.id::text, a.name FROM actions a WHERE a.goal_id IS NULL;

-- ============================================================
-- 10. Row-Level Security — изоляция арендаторов на уровне БД
-- ============================================================
ALTER TABLE goals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_expressions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE development_cycles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_qualities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections          ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON goals
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY tenant_isolation ON qualities
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY tenant_isolation ON actions
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY tenant_isolation ON development_cycles
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY tenant_isolation ON reflections
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON quality_expressions
    USING (action_id IN (SELECT id FROM actions WHERE user_id = current_setting('app.current_user_id', true)::uuid))
    WITH CHECK (action_id IN (SELECT id FROM actions WHERE user_id = current_setting('app.current_user_id', true)::uuid));

CREATE POLICY tenant_isolation ON cycle_goals
    USING (cycle_id IN (SELECT id FROM development_cycles WHERE user_id = current_setting('app.current_user_id', true)::uuid));
CREATE POLICY tenant_isolation ON cycle_qualities
    USING (cycle_id IN (SELECT id FROM development_cycles WHERE user_id = current_setting('app.current_user_id', true)::uuid));

-- ============================================================
-- 11. Роль приложения — с наименьшими необходимыми правами
-- ============================================================
-- CREATE ROLE не идемпотентен, роли глобальны для кластера (не для базы):
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_writer') THEN
        CREATE ROLE app_writer LOGIN PASSWORD 'change_me_in_production';
    END IF;
END
$$;
GRANT CONNECT ON DATABASE selfdev TO app_writer;
GRANT USAGE ON SCHEMA public TO app_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    users, goals, qualities, actions, quality_expressions,
    development_cycles, cycle_goals, cycle_qualities, reflections
    TO app_writer;
GRANT SELECT ON option_lists, quality_groups, action_contexts, score_legend,
    goal_hierarchy, goal_counts, quality_stats, action_stats, v_data_quality_alerts
    TO app_writer;
-- app_writer НЕ владелец таблиц: DDL/DROP/BYPASSRLS недоступны по определению этой роли.
