-- ============================================================
-- 14. goal_hierarchy: добавлена path_ids
-- ============================================================
-- Рекурсивный CTE внутри goal_hierarchy уже вычислял path_ids (массив id
-- от корня до узла -- используется самим CTE для защиты от циклов), но
-- финальный SELECT представления его не выставлял наружу. Понадобилось
-- для статистики по поддереву цели (§4 обратной связи: "объединённая
-- статистика цели + всех подцелей вместе"): "goal_id = ANY(path_ids)"
-- -- стандартный способ найти узел и всех его потомков одним условием,
-- без отдельного рекурсивного запроса на каждый вызов.
--
-- CREATE OR REPLACE не годится здесь: PostgreSQL не разрешает менять
-- порядок/состав колонок существующего представления через REPLACE,
-- только дописывать в конец -- а добавление в середину списка (там, где
-- семантически на месте) требует DROP+CREATE. Тот же приём, что и в
-- миграции 10 для quality_stats/action_stats: DROP ... CASCADE, пересоздать,
-- заново применить ALTER VIEW ... SET (security_invoker = true) -- эта
-- настройка не переживает пересоздание представления.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS goal_hierarchy CASCADE;

CREATE VIEW goal_hierarchy AS
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
SELECT id, user_id, parent_id, name, level, path, path_ids, root_id, root_name FROM tree;

ALTER VIEW goal_hierarchy SET (security_invoker = true);
GRANT SELECT ON goal_hierarchy TO app_writer;

COMMIT;
