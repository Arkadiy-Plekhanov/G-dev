-- ADR-001: is_relevant удалена -- существование записи = релевантность.
BEGIN;

-- Строки без оценки не имеют корректного представления в новой модели.
-- В реальных данных владельца таких строк 0 (проверено перед написанием
-- этой миграции) -- это защита на случай тестовых/будущих данных, не
-- ожидаемое удаление реальной истории.
DELETE FROM quality_expressions WHERE NOT is_relevant;

ALTER TABLE quality_expressions ALTER COLUMN score SET NOT NULL;
-- DROP COLUMN is_relevant и DROP CONSTRAINT ...invariant перенесены в конец
-- файла: сначала нужно переключить все три VIEW на новую (уже не
-- ссылающуюся на is_relevant) логику, иначе Postgres не даст дропнуть
-- колонку, от которой они всё ещё зависят.

-- ---------- VIEW: убираем фильтрацию по is_relevant -- фильтровать больше не по чему ----------
DROP VIEW quality_stats;
CREATE VIEW quality_stats AS
WITH relevant_expr AS (
    SELECT qe.quality_id, qe.score, a.occurred_at, uq.user_id
    FROM quality_expressions qe
    JOIN actions a ON a.id = qe.action_id
    JOIN user_qualities uq ON uq.id = qe.quality_id
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
GRANT SELECT ON quality_stats TO app_writer;

CREATE OR REPLACE VIEW action_stats AS
SELECT a.id AS action_id, a.user_id, count(qe.id) AS quality_count, avg(qe.score) AS avg_score
FROM actions a LEFT JOIN quality_expressions qe ON qe.action_id = a.id GROUP BY a.id, a.user_id;
ALTER VIEW action_stats SET (security_invoker = true);
GRANT SELECT ON action_stats TO app_writer;

DROP VIEW v_data_quality_alerts;
CREATE VIEW v_data_quality_alerts AS
SELECT uq.user_id, 'quality_overdue_review' AS check_name, uq.id::text AS record_id, cq.name->>'en' AS label
FROM user_qualities uq JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
WHERE uq.next_review_at IS NOT NULL AND uq.next_review_at < current_date
UNION ALL
SELECT uq.user_id, 'quality_never_practiced', uq.id::text, cq.name->>'en'
FROM user_qualities uq JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
WHERE NOT EXISTS (SELECT 1 FROM quality_expressions qe WHERE qe.quality_id = uq.id)
UNION ALL
SELECT a.user_id, 'action_missing_goal', a.id::text, a.name FROM actions a WHERE a.goal_id IS NULL;
ALTER VIEW v_data_quality_alerts SET (security_invoker = true);
GRANT SELECT ON v_data_quality_alerts TO app_writer;

-- Теперь ни один VIEW не ссылается на is_relevant -- можно безопасно
-- удалить саму колонку и ставший бессмысленным CHECK-инвариант.
ALTER TABLE quality_expressions
    DROP CONSTRAINT quality_expressions_relevance_score_invariant,
    DROP COLUMN is_relevant;

COMMIT;
