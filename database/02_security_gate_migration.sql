-- ============================================================
-- SECURITY GATE MIGRATION
-- Составные ownership-FK (user_id, id) как основной механизм
-- межарендаторской целостности; RLS остаётся механизмом
-- видимости строк. Триггеры упрощены до того единственного,
-- что FK физически не может выразить -- обнаружение циклов
-- произвольной глубины в дереве целей.
-- ============================================================

BEGIN;

-- ---------- 1. UNIQUE(user_id, id) на родительских таблицах ----------
-- Требование стандарта SQL: composite FK должен ссылаться на unique-ограничение.
ALTER TABLE goals              ADD CONSTRAINT uq_goals_user_id            UNIQUE (user_id, id);
ALTER TABLE qualities          ADD CONSTRAINT uq_qualities_user_id        UNIQUE (user_id, id);
ALTER TABLE actions            ADD CONSTRAINT uq_actions_user_id          UNIQUE (user_id, id);
ALTER TABLE development_cycles ADD CONSTRAINT uq_dev_cycles_user_id       UNIQUE (user_id, id);

-- ---------- 2. quality_expressions: добавляем user_id ----------
-- Раньше принадлежность выводилась только через action_id (косвенно).
-- Теперь user_id хранится прямо -- это и есть материал для composite FK,
-- и он же упрощает RLS-политику (прямое сравнение вместо подзапроса).
ALTER TABLE quality_expressions ADD COLUMN user_id uuid;
UPDATE quality_expressions qe SET user_id = a.user_id FROM actions a WHERE a.id = qe.action_id;
ALTER TABLE quality_expressions ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_qexpr_user_id ON quality_expressions(user_id);

ALTER TABLE quality_expressions
    ADD CONSTRAINT qexpr_action_owner  FOREIGN KEY (user_id, action_id)  REFERENCES actions(user_id, id)  ON DELETE CASCADE,
    ADD CONSTRAINT qexpr_quality_owner FOREIGN KEY (user_id, quality_id) REFERENCES qualities(user_id, id) ON DELETE CASCADE;

-- Старый триггер-затычка на пару владельцев больше не нужен:
-- оба composite FK выше физически гарантируют action.user_id = qe.user_id = quality.user_id,
-- что транзитивно означает "у действия и качества один и тот же владелец".
-- Декларативный constraint надёжнее и не зависит от того, не сломает ли
-- кто-то триггер будущим рефакторингом.
DROP TRIGGER IF EXISTS trg_quality_expressions_same_owner ON quality_expressions;
DROP FUNCTION IF EXISTS quality_expressions_same_owner();

-- ---------- 3. goals.parent_id -- composite self-FK ----------
ALTER TABLE goals
    ADD CONSTRAINT goals_parent_owner FOREIGN KEY (user_id, parent_id) REFERENCES goals(user_id, id);
-- NULL parent_id композитный FK не проверяет (MATCH SIMPLE по умолчанию) -- корневые цели не задеты.

-- Упрощаем триггер: проверку "родитель того же владельца" теперь делает FK выше;
-- в триггере остаётся только то, что FK выразить не может -- обход цикла произвольной глубины.
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
-- (сам CREATE TRIGGER trg_goals_prevent_cycle не менялся, функция подменяется по имени)

-- ---------- 4. actions.goal_id -- composite FK, точечный SET NULL (PG15+) ----------
ALTER TABLE actions
    ADD CONSTRAINT actions_goal_owner FOREIGN KEY (user_id, goal_id) REFERENCES goals(user_id, id)
    ON DELETE SET NULL (goal_id);
-- ON DELETE SET NULL (goal_id), а не просто SET NULL: обнуляет только goal_id,
-- а не user_id вместе с ним -- ровно то, для чего эта форма и введена в PG15
-- ("useful for multitenant... schemas, where the tenant ID ... shouldn't be set to null").

-- ---------- 5. cycle_goals / cycle_qualities -- добавляем user_id + composite FK на обе стороны ----------
ALTER TABLE cycle_goals ADD COLUMN user_id uuid;
UPDATE cycle_goals cg SET user_id = dc.user_id FROM development_cycles dc WHERE dc.id = cg.cycle_id;
ALTER TABLE cycle_goals ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cycle_goals
    ADD CONSTRAINT cycle_goals_cycle_owner FOREIGN KEY (user_id, cycle_id) REFERENCES development_cycles(user_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT cycle_goals_goal_owner  FOREIGN KEY (user_id, goal_id)  REFERENCES goals(user_id, id)              ON DELETE CASCADE;

ALTER TABLE cycle_qualities ADD COLUMN user_id uuid;
UPDATE cycle_qualities cq SET user_id = dc.user_id FROM development_cycles dc WHERE dc.id = cq.cycle_id;
ALTER TABLE cycle_qualities ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cycle_qualities
    ADD CONSTRAINT cycle_qualities_cycle_owner   FOREIGN KEY (user_id, cycle_id)   REFERENCES development_cycles(user_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT cycle_qualities_quality_owner FOREIGN KEY (user_id, quality_id) REFERENCES qualities(user_id, id)          ON DELETE CASCADE;

-- ---------- 6. reflections.goal_id / cycle_id -- composite FK ----------
ALTER TABLE reflections
    ADD CONSTRAINT reflections_goal_owner  FOREIGN KEY (user_id, goal_id)  REFERENCES goals(user_id, id)              ON DELETE SET NULL (goal_id),
    ADD CONSTRAINT reflections_cycle_owner FOREIGN KEY (user_id, cycle_id) REFERENCES development_cycles(user_id, id) ON DELETE SET NULL (cycle_id);

-- ---------- 7. FORCE ROW LEVEL SECURITY ----------
-- Без FORCE политики не действуют на владельца таблицы. Наша app-роль (app_writer)
-- владельцем не является (таблицы принадлежат postgres) -- но FORCE ставим на
-- всех арендаторских таблицах как безусловную гарантию, не завязанную на то,
-- кто именно когда-нибудь будет подключаться к БД.
ALTER TABLE goals               FORCE ROW LEVEL SECURITY;
ALTER TABLE qualities            FORCE ROW LEVEL SECURITY;
ALTER TABLE actions              FORCE ROW LEVEL SECURITY;
ALTER TABLE quality_expressions  FORCE ROW LEVEL SECURITY;
ALTER TABLE development_cycles   FORCE ROW LEVEL SECURITY;
ALTER TABLE cycle_goals          FORCE ROW LEVEL SECURITY;
ALTER TABLE cycle_qualities      FORCE ROW LEVEL SECURITY;
ALTER TABLE reflections          FORCE ROW LEVEL SECURITY;

-- ---------- 8. Упрощаем RLS-политику quality_expressions (теперь есть прямой user_id) ----------
DROP POLICY IF EXISTS tenant_isolation ON quality_expressions;
CREATE POLICY tenant_isolation ON quality_expressions
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON cycle_goals;
CREATE POLICY tenant_isolation ON cycle_goals
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON cycle_qualities;
CREATE POLICY tenant_isolation ON cycle_qualities
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- ---------- 9. security_invoker на VIEW ----------
-- Без этого VIEW выполняется с правами СОЗДАТЕЛЯ (постгрес-владельца), что
-- обходит RLS вызывающей роли -- отдельный, тихий канал утечки, независимый
-- от FK-канала. PG15+.
ALTER VIEW goal_hierarchy       SET (security_invoker = true);
ALTER VIEW goal_counts          SET (security_invoker = true);
ALTER VIEW quality_stats        SET (security_invoker = true);
ALTER VIEW action_stats         SET (security_invoker = true);
ALTER VIEW v_data_quality_alerts SET (security_invoker = true);

COMMIT;
