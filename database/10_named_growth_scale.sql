-- ============================================================
-- 10. Именованная шкала роста + отделение обратного проявления
-- ============================================================
-- Решение владельца (вариант B, 29.08.2026):
--
-- Шкала оценки перестаёт быть числовой и разделяется на ДВЕ РАЗНЫЕ ВЕЩИ:
--
--   1..4 -- ступени РОСТА качества (соответствуют классической модели
--           четырёх стадий компетентности). Метафора из Агни Йоги: Агни --
--           огонь как сила жизни и творчества -- кристаллизуется в твёрдые
--           черты характера (камни). Нижние ступени горят, верхняя -- камень:
--             1 Spark    -- намерение было живо, но результата не вышло
--             2 Kindling -- сознательное усилие, качество росло, проявилось слабо
--             3 Flame    -- проявлено крепко и сознательно, есть прогресс
--             4 Gem      -- не требовало сознательных усилий; черта характера
--
--   0 -- ОБРАТНОЕ ПРОЯВЛЕНИЕ, вне шкалы роста. Не "минус первая ступень".
--
-- Почему разделены: если 0 остаётся на одной числовой шкале с ростом, то
-- среднее смешивает два разных вопроса -- "насколько развито качество" и
-- "как часто срываюсь". Разделение делает обе цифры честными.
-- Прежний ноль ("проявлено противоположным образом") по смыслу сохраняется --
-- меняется его место: он больше не участвует в средних, а считается отдельно.
--
-- Второе изменение здесь же: stability/confidence/trend перестают быть
-- русскими человекочитаемыми строками и становятся машиночитаемыми кодами.
-- Прежний вариант отдавал '↑ Растёт' прямо в англоязычный интерфейс; при
-- планируемых семи языках перевод обязан жить во фронтенде, а не в SQL.
-- Тот же принцип, что и с доменными кодами ошибок в app/errors.py.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- score_legend: i18n + явный признак "это ступень роста"
-- ------------------------------------------------------------
ALTER TABLE score_legend ADD COLUMN slug text;
ALTER TABLE score_legend ADD COLUMN name jsonb;
ALTER TABLE score_legend ADD COLUMN description jsonb;
ALTER TABLE score_legend ADD COLUMN is_growth_stage boolean NOT NULL DEFAULT true;

UPDATE score_legend SET
    slug = 'inverted',
    is_growth_stage = false,
    name = '{"en": "Went the other way", "ru": "Пошло иначе"}'::jsonb,
    description = '{"en": "The quality was called for, and the opposite happened. Not a lower rung -- a different kind of entry, kept off the growth scale so it never distorts what your averages mean.", "ru": "Качество было уместно, но проявилось противоположным образом. Не низшая ступень, а запись другого рода -- вне шкалы роста, чтобы не искажать средние."}'::jsonb
WHERE score = 0;

UPDATE score_legend SET
    slug = 'spark',
    name = '{"en": "Spark", "ru": "Искра"}'::jsonb,
    description = '{"en": "The intention was alive -- you saw where the quality belonged -- but it did not carry through to a result.", "ru": "Намерение было живо -- вы видели, где качество уместно, -- но до результата оно не дошло."}'::jsonb
WHERE score = 1;

UPDATE score_legend SET
    slug = 'kindling',
    name = '{"en": "Kindling", "ru": "Возгорание"}'::jsonb,
    description = '{"en": "You worked at it deliberately. The quality grew, but showed up weakly.", "ru": "Вы сознательно его укрепляли. Качество росло, но проявилось слабо."}'::jsonb
WHERE score = 2;

UPDATE score_legend SET
    slug = 'flame',
    name = '{"en": "Flame", "ru": "Пламя"}'::jsonb,
    description = '{"en": "Clear and deliberate. The quality held, and it moved something.", "ru": "Крепко и сознательно. Качество выстояло и что-то сдвинуло."}'::jsonb
WHERE score = 3;

UPDATE score_legend SET
    slug = 'gem',
    name = '{"en": "Gem", "ru": "Кристалл"}'::jsonb,
    description = '{"en": "It took no conscious effort. The quality has set into character -- it is simply how you acted.", "ru": "Не потребовало сознательных усилий. Качество закрепилось в характере -- вы просто так поступили."}'::jsonb
WHERE score = 4;

ALTER TABLE score_legend ALTER COLUMN slug SET NOT NULL;
ALTER TABLE score_legend ALTER COLUMN name SET NOT NULL;
ALTER TABLE score_legend ALTER COLUMN description SET NOT NULL;
ALTER TABLE score_legend ADD CONSTRAINT uq_score_legend_slug UNIQUE (slug);
ALTER TABLE score_legend DROP COLUMN meaning;

GRANT SELECT ON score_legend TO app_writer;

-- ------------------------------------------------------------
-- quality_stats: средние -- только по ступеням роста; срывы -- отдельно
-- ------------------------------------------------------------
DROP VIEW IF EXISTS quality_stats CASCADE;

CREATE VIEW quality_stats AS
WITH all_expr AS (
    SELECT qe.quality_id, qe.score, a.occurred_at, uq.user_id
    FROM quality_expressions qe
    JOIN actions a ON a.id = qe.action_id
    JOIN user_qualities uq ON uq.id = qe.quality_id
),
-- Ступени роста (1..4). Всё, что считает "насколько развито качество",
-- берётся ОТСЮДА -- обратные проявления сюда не входят.
growth_expr AS (
    SELECT * FROM all_expr WHERE score >= 1
),
-- "Последний раз замечено" считается по ВСЕМ записям, включая обратные:
-- сорвался -- значит всё-таки заметил качество, оно было в сознании.
last_seen AS (
    SELECT quality_id, max(occurred_at) AS last_expressed_at FROM all_expr GROUP BY quality_id
),
last_growth_date AS (
    SELECT quality_id, max(occurred_at) AS d FROM growth_expr GROUP BY quality_id
),
last_score AS (
    SELECT lg.quality_id, avg(ge.score) AS last_score
    FROM last_growth_date lg JOIN growth_expr ge ON ge.quality_id = lg.quality_id AND ge.occurred_at = lg.d
    GROUP BY lg.quality_id
),
inversions AS (
    SELECT quality_id,
        count(*) AS inversion_count,
        max(occurred_at) AS last_inverted_at,
        count(*) FILTER (WHERE occurred_at >= current_date - 29) AS inversion_count_30d
    FROM all_expr WHERE score = 0 GROUP BY quality_id
),
agg AS (
    SELECT quality_id,
        avg(score) AS avg_score_all_time,
        avg(score) FILTER (WHERE occurred_at >= current_date - 29) AS avg_score_30d,
        avg(score) FILTER (WHERE occurred_at >= current_date - 59 AND occurred_at < current_date - 29) AS avg_score_prev_30d,
        count(*) FILTER (WHERE occurred_at >= current_date - 29) AS n_30d,
        count(*) FILTER (WHERE occurred_at >= current_date - 59 AND occurred_at < current_date - 29) AS n_prev_30d,
        count(*) AS expression_count,
        count(*) FILTER (WHERE score >= 3)::numeric / NULLIF(count(*), 0) AS share_strong,
        max(score) - min(score) AS score_range
    FROM growth_expr GROUP BY quality_id
)
SELECT uq.id AS quality_id, uq.user_id, uq.catalog_quality_id,
    ls_seen.last_expressed_at,
    ls.last_score,
    a.avg_score_all_time, a.avg_score_30d, a.avg_score_prev_30d,
    -- coalesce: счётчик -- всегда число. NULL означал бы "неизвестно", но
    -- ноль записей известен точно. Среднее (avg_*) при этом остаётся NULL --
    -- там NULL честен: усреднять нечего. Разные вещи, разное поведение.
    coalesce(a.expression_count, 0) AS expression_count,  -- ступеней роста (основа среднего)
    a.share_strong,               -- доля Flame+Gem
    coalesce(inv.inversion_count, 0)     AS inversion_count,
    coalesce(inv.inversion_count_30d, 0) AS inversion_count_30d,
    inv.last_inverted_at,
    -- Машиночитаемые коды: перевод -- во фронтенде (i18n), не здесь.
    CASE WHEN a.expression_count IS NULL OR a.expression_count < 3 THEN 'insufficient_data'
         WHEN a.score_range <= 1 THEN 'high'
         WHEN a.score_range = 2 THEN 'medium'
         ELSE 'low' END AS stability,
    CASE WHEN a.expression_count IS NULL OR a.expression_count = 0 THEN 'no_data'
         WHEN a.expression_count <= 2 THEN 'very_limited'
         WHEN a.expression_count <= 5 THEN 'limited'
         WHEN a.expression_count <= 14 THEN 'sufficient'
         ELSE 'robust' END AS confidence,
    CASE WHEN coalesce(a.n_30d,0) < 3 OR coalesce(a.n_prev_30d,0) < 3 THEN 'insufficient_data'
         WHEN a.avg_score_30d - a.avg_score_prev_30d >= 0.2 THEN 'rising'
         WHEN a.avg_score_30d - a.avg_score_prev_30d <= -0.2 THEN 'declining'
         ELSE 'steady' END AS trend
FROM user_qualities uq
LEFT JOIN last_seen ls_seen ON ls_seen.quality_id = uq.id
LEFT JOIN last_score ls ON ls.quality_id = uq.id
LEFT JOIN inversions inv ON inv.quality_id = uq.id
LEFT JOIN agg a ON a.quality_id = uq.id;

ALTER VIEW quality_stats SET (security_invoker = true);
GRANT SELECT ON quality_stats TO app_writer;

-- ------------------------------------------------------------
-- action_stats: то же разделение на уровне действия
-- ------------------------------------------------------------
DROP VIEW IF EXISTS action_stats CASCADE;

CREATE VIEW action_stats AS
SELECT a.id AS action_id, a.user_id,
    count(qe.id) AS quality_count,
    avg(qe.score) FILTER (WHERE qe.score >= 1) AS avg_score,
    count(qe.id) FILTER (WHERE qe.score = 0) AS inversion_count
FROM actions a LEFT JOIN quality_expressions qe ON qe.action_id = a.id
GROUP BY a.id, a.user_id;

ALTER VIEW action_stats SET (security_invoker = true);
GRANT SELECT ON action_stats TO app_writer;

COMMIT;
