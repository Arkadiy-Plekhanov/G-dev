import uuid

import psycopg2
from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id
from app.errors import api_error, raise_from_db_error
from app.schemas import GoalIn, GoalOut

router = APIRouter(prefix="/goals", tags=["goals"])

_SELECT = """
    SELECT g.id, g.parent_id, g.name, g.description, g.status_code, g.priority_code,
           g.start_date, g.target_date, g.progress_pct,
           gh.level, gh.path, gc.child_goal_count, gc.action_count
    FROM goals g
    LEFT JOIN goal_hierarchy gh ON gh.id = g.id
    LEFT JOIN goal_counts gc ON gc.goal_id = g.id
"""


@router.get("", response_model=list[GoalOut])
def list_goals(user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " ORDER BY gh.path NULLS LAST")
        return cur.fetchall()


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(body: GoalIn, user_id: str = Depends(get_current_user_id)):
    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO goals (id, user_id, parent_id, name, description, status_code,
                                       priority_code, start_date, target_date, progress_pct)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (new_id, user_id, body.parent_id, body.name, body.description, body.status_code,
                 body.priority_code, body.start_date, body.target_date, body.progress_pct),
            )
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE g.id = %s", (new_id,))
        return cur.fetchone()


@router.get("/{goal_id}", response_model=GoalOut)
def get_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE g.id = %s", (goal_id,))
        row = cur.fetchone()
    if row is None:
        api_error(404, "GOAL_NOT_FOUND", "Цель не найдена")
    return row


@router.get("/{goal_id}/overview")
def get_goal_overview(goal_id: str, user_id: str = Depends(get_current_user_id)):
    """Карточка цели -- read-model, спроектированный ещё в forensic-аудите
    исходного Excel (лист «Аналитика», блок «Карточка цели»): сама цель +
    последние действия + качества, проявившиеся под этой целью, со
    сравнением средней оценки «в рамках этой цели» с обычной средней
    качества (порог ±0.3, как в исходной Excel-формуле).

    Дополнительно (обратная связь с реального использования): если у цели
    есть подцели, добавляется subtree -- та же качественная разбивка, но
    ОБЪЕДИНЁННАЯ по этой цели и всем её потомкам вместе (рекурсивно, через
    goal_hierarchy.path_ids), и children -- краткая статистика по каждой
    ПРЯМОЙ подцели отдельно, чтобы было видно, откуда именно складывается
    общая картина. Для целей без подцелей subtree/children не считаются
    вообще -- иначе это была бы точная копия уже показанных чисел, шум без
    новой информации."""
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE g.id = %s", (goal_id,))
        goal = cur.fetchone()
        if goal is None:
            api_error(404, "GOAL_NOT_FOUND", "Цель не найдена")

        cur.execute(
            """SELECT a.id, a.name, a.occurred_at, a.context_id, ast.avg_score, ast.quality_count
               FROM actions a LEFT JOIN action_stats ast ON ast.action_id = a.id
               WHERE a.goal_id = %s ORDER BY a.occurred_at DESC, a.created_at DESC LIMIT 8""",
            (goal_id,),
        )
        recent_actions = cur.fetchall()

        cur.execute(
            """WITH per_goal AS (
                   SELECT qe.quality_id, count(*) AS count_in_goal, avg(qe.score) AS avg_in_goal
                   FROM quality_expressions qe
                   JOIN actions a ON a.id = qe.action_id
                   WHERE a.goal_id = %s
                   GROUP BY qe.quality_id
               )
               SELECT cq.id AS catalog_quality_id, uq.id AS quality_id, cq.name, pg.count_in_goal, pg.avg_in_goal,
                      qs.avg_score_all_time,
                      CASE WHEN qs.avg_score_all_time IS NULL THEN NULL
                           WHEN pg.avg_in_goal > qs.avg_score_all_time + 0.3 THEN 'above_usual'
                           WHEN pg.avg_in_goal < qs.avg_score_all_time - 0.3 THEN 'below_usual'
                           ELSE 'as_usual' END AS vs_baseline
               FROM per_goal pg
               JOIN user_qualities uq ON uq.id = pg.quality_id
               JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
               LEFT JOIN quality_stats qs ON qs.quality_id = pg.quality_id
               ORDER BY pg.count_in_goal DESC LIMIT 10""",
            (goal_id,),
        )
        qualities = cur.fetchall()

        subtree = None
        children = []
        if goal["child_goal_count"] and goal["child_goal_count"] > 0:
            cur.execute(
                """WITH subtree_ids AS (
                       SELECT id FROM goal_hierarchy WHERE %(goal_id)s = ANY(path_ids)
                   ),
                   per_subtree AS (
                       SELECT qe.quality_id, count(*) AS count_in_goal, avg(qe.score) AS avg_in_goal
                       FROM quality_expressions qe
                       JOIN actions a ON a.id = qe.action_id
                       WHERE a.goal_id IN (SELECT id FROM subtree_ids)
                       GROUP BY qe.quality_id
                   )
                   SELECT
                       (SELECT count(*) FROM actions WHERE goal_id IN (SELECT id FROM subtree_ids)) AS action_count,
                       (SELECT count(*) FROM subtree_ids) - 1 AS descendant_goal_count,
                       (
                           SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.count_in_goal DESC), '[]'::jsonb)
                           FROM (
                               SELECT cq.id AS catalog_quality_id, uq.id AS quality_id, cq.name,
                                      ps.count_in_goal, ps.avg_in_goal, qs.avg_score_all_time,
                                      CASE WHEN qs.avg_score_all_time IS NULL THEN NULL
                                           WHEN ps.avg_in_goal > qs.avg_score_all_time + 0.3 THEN 'above_usual'
                                           WHEN ps.avg_in_goal < qs.avg_score_all_time - 0.3 THEN 'below_usual'
                                           ELSE 'as_usual' END AS vs_baseline
                               FROM per_subtree ps
                               JOIN user_qualities uq ON uq.id = ps.quality_id
                               JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
                               LEFT JOIN quality_stats qs ON qs.quality_id = ps.quality_id
                               LIMIT 10
                           ) x
                       ) AS qualities""",
                {"goal_id": goal_id},
            )
            subtree = cur.fetchone()

            # Прямые подцели по отдельности -- краткая статистика каждой,
            # чтобы было видно, откуда складывается subtree выше. Не
            # рекурсивно (только уровень ниже): собственная карточка
            # каждой подцели -- уже полноценный /goals/{id}/overview,
            # дублировать её содержимое здесь незачем.
            cur.execute(
                """SELECT g.id, g.name, g.status_code,
                          (SELECT count(*) FROM actions a WHERE a.goal_id = g.id) AS action_count,
                          (SELECT count(*) FROM goals c WHERE c.parent_id = g.id) AS child_goal_count
                   FROM goals g WHERE g.parent_id = %s ORDER BY g.name""",
                (goal_id,),
            )
            children = cur.fetchall()

    return {"goal": goal, "recent_actions": recent_actions, "qualities": qualities,
            "subtree": subtree, "children": children}


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: str, body: GoalIn, user_id: str = Depends(get_current_user_id)):
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """UPDATE goals SET parent_id=%s, name=%s, description=%s, status_code=%s,
                                     priority_code=%s, start_date=%s, target_date=%s,
                                     progress_pct=%s, updated_at=now()
                   WHERE id=%s""",
                (body.parent_id, body.name, body.description, body.status_code, body.priority_code,
                 body.start_date, body.target_date, body.progress_pct, goal_id),
            )
            if cur.rowcount == 0:
                api_error(404, "GOAL_NOT_FOUND", "Цель не найдена")
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE g.id = %s", (goal_id,))
        return cur.fetchone()


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute("DELETE FROM goals WHERE id = %s", (goal_id,))
        if cur.rowcount == 0:
            api_error(404, "GOAL_NOT_FOUND", "Цель не найдена")
