BEGIN;

-- ============================================================
-- Перенос реальных данных владельца: qualities -> user_qualities.
-- Трюк: сохраняем СТАРЫЙ qualities.id как новый user_qualities.id.
-- Тогда quality_expressions.quality_id и cycle_qualities.quality_id,
-- которые уже физически хранят эти значения, остаются валидными без
-- единого UPDATE -- переключается только то, НА КАКУЮ таблицу
-- смотрит FK, не сами данные.
-- Тестовые артефакты (без legacy_code -- "E2E качество" и т.п.)
-- сознательно не переносятся, как и было условлено при первой миграции.
-- ============================================================
INSERT INTO user_qualities (
    id, user_id, legacy_code, catalog_quality_id,
    dev_priority_code, focus_code, dev_status_code,
    current_level, last_reviewed_at, next_review_at,
    source, created_at, updated_at
)
SELECT
    q.id, q.user_id, q.legacy_code, cq.id,
    q.dev_priority_code, q.focus_code, q.dev_status_code,
    q.current_level, q.last_reviewed_at, q.next_review_at,
    'manual', q.created_at, q.updated_at
FROM qualities q
JOIN catalog_qualities cq ON cq.name->>'ru' = q.name
WHERE q.legacy_code IS NOT NULL;

-- ---------- Перенастройка composite FK: qualities -> user_qualities ----------
-- Кроме composite FK (qexpr_quality_owner), при базовом создании таблицы
-- также неявно создался обычный одноколоночный FK из самого объявления
-- колонки (REFERENCES qualities(id)) -- его тоже нужно снять явно,
-- иначе DROP TABLE qualities откажет из-за оставшейся зависимости.
ALTER TABLE quality_expressions DROP CONSTRAINT qexpr_quality_owner;
ALTER TABLE quality_expressions DROP CONSTRAINT quality_expressions_quality_id_fkey;
ALTER TABLE quality_expressions
    ADD CONSTRAINT qexpr_quality_owner FOREIGN KEY (user_id, quality_id)
    REFERENCES user_qualities(user_id, id) ON DELETE CASCADE;

ALTER TABLE cycle_qualities DROP CONSTRAINT cycle_qualities_quality_owner;
ALTER TABLE cycle_qualities DROP CONSTRAINT cycle_qualities_quality_id_fkey;
ALTER TABLE cycle_qualities
    ADD CONSTRAINT cycle_qualities_quality_owner FOREIGN KEY (user_id, quality_id)
    REFERENCES user_qualities(user_id, id) ON DELETE CASCADE;

-- (DROP TABLE qualities перенесён в конец файла -- сначала нужно
-- переключить VIEW на новые таблицы, чтобы у qualities не осталось
-- ни одной зависимости)

-- ---------- VIEW: переключение с qualities на user_qualities+catalog_qualities ----------
-- CREATE OR REPLACE не годится: новый SELECT добавляет catalog_quality_id
-- не последней колонкой, а Postgres требует у REPLACE тот же порядок
-- колонок, что был раньше -- явный DROP+CREATE проще и надёжнее для
-- такой существенной перестройки.
DROP VIEW quality_stats;
CREATE VIEW quality_stats AS
WITH relevant_expr AS (
    SELECT qe.quality_id, qe.score, a.occurred_at, uq.user_id
    FROM quality_expressions qe
    JOIN actions a ON a.id = qe.action_id
    JOIN user_qualities uq ON uq.id = qe.quality_id
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
SELECT uq.id AS quality_id, uq.user_id, uq.catalog_quality_id,
    ld.last_expressed_at, ls.last_score,
    a.avg_score_all_time, a.avg_score_30d, a.avg_score_prev_30d, a.expression_count, a.share_ge_3,
    CASE WHEN a.expression_count IS NULL OR a.expression_count < 3 THEN 'Недостаточно данных'
         WHEN a.score_range <= 1 THEN 'Высокая' WHEN a.score_range = 2 THEN 'Средняя' ELSE 'Низкая' END AS stability,
    CASE WHEN a.expression_count IS NULL OR a.expression_count = 0 THEN 'Нет данных'
         WHEN a.expression_count <= 2 THEN 'Очень мало данных' WHEN a.expression_count <= 5 THEN 'Ограниченные данные'
         WHEN a.expression_count <= 14 THEN 'Достаточно данных' ELSE 'Устойчивая выборка' END AS confidence,
    CASE WHEN coalesce(a.n_30d,0) < 3 OR coalesce(a.n_prev_30d,0) < 3 THEN 'Недостаточно данных'
         WHEN a.avg_score_30d - a.avg_score_prev_30d >= 0.2 THEN '↑ Растёт'
         WHEN a.avg_score_30d - a.avg_score_prev_30d <= -0.2 THEN '↓ Снижается' ELSE '→ Стабильно' END AS trend
FROM user_qualities uq
LEFT JOIN last_date ld ON ld.quality_id = uq.id
LEFT JOIN last_score ls ON ls.quality_id = uq.id
LEFT JOIN agg a ON a.quality_id = uq.id;
ALTER VIEW quality_stats SET (security_invoker = true);

DROP VIEW v_data_quality_alerts;
CREATE VIEW v_data_quality_alerts AS
SELECT uq.user_id, 'quality_overdue_review' AS check_name, uq.id::text AS record_id, cq.name->>'en' AS label
FROM user_qualities uq JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
WHERE uq.next_review_at IS NOT NULL AND uq.next_review_at < current_date
UNION ALL
SELECT uq.user_id, 'quality_never_practiced', uq.id::text, cq.name->>'en'
FROM user_qualities uq JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
WHERE NOT EXISTS (SELECT 1 FROM quality_expressions qe WHERE qe.quality_id = uq.id AND qe.is_relevant)
UNION ALL
SELECT a.user_id, 'action_missing_goal', a.id::text, a.name FROM actions a WHERE a.goal_id IS NULL;
ALTER VIEW v_data_quality_alerts SET (security_invoker = true);

-- DROP VIEW + CREATE VIEW (в отличие от CREATE OR REPLACE) не сохраняет
-- ранее выданные GRANT -- права нужно выдать заново явно, иначе app_writer
-- останется без SELECT на пересозданные VIEW (поймано живым прогоном).
GRANT SELECT ON quality_stats, v_data_quality_alerts TO app_writer;

-- Теперь у qualities не осталось ни одной зависимости (FK перенастроены
-- выше, VIEW переключены только что) -- можно безопасно удалить старую
-- полностью персональную таблицу: модель качеств теперь "глобальный
-- каталог + персональное принятие" (решение владельца #5).
DROP TABLE qualities;

COMMIT;
