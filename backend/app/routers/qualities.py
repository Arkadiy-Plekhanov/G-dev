import uuid

import psycopg2
from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id
from app.errors import api_error, raise_from_db_error
from app.schemas import UserQualityManualIn, UserQualityOut

router = APIRouter(prefix="/qualities", tags=["qualities"])

_SELECT = """
    SELECT uq.id, uq.catalog_quality_id, cq.name, cq.definition, uq.focus_code, uq.dev_status_code,
           uq.current_level, uq.source,
           qs.avg_score_all_time, qs.avg_score_30d, qs.trend, qs.stability, qs.confidence,
           qs.last_expressed_at, qs.expression_count, qs.inversion_count, qs.inversion_count_30d
    FROM user_qualities uq
    JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
    LEFT JOIN quality_stats qs ON qs.quality_id = uq.id
"""


@router.get("", response_model=list[UserQualityOut])
def list_my_qualities(user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " ORDER BY cq.name->>'en'")
        return cur.fetchall()


@router.post("", response_model=UserQualityOut, status_code=201)
def adopt_quality_manually(body: UserQualityManualIn, user_id: str = Depends(get_current_user_id)):
    """Путь (в) из трёх равноценных путей построения фокуса: ручной выбор
    одного качества из глобального каталога."""
    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO user_qualities (id, user_id, catalog_quality_id, dev_priority_code,
                                                 focus_code, dev_status_code, current_level, source)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'manual')""",
                (new_id, user_id, body.catalog_quality_id, body.dev_priority_code,
                 body.focus_code, body.dev_status_code, body.current_level),
            )
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE uq.id = %s", (new_id,))
        return cur.fetchone()


@router.get("/{user_quality_id}", response_model=UserQualityOut)
def get_my_quality(user_quality_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE uq.id = %s", (user_quality_id,))
        row = cur.fetchone()
    if row is None:
        api_error(404, "QUALITY_NOT_FOUND", "Качество не найдено в вашем наборе")
    return row


@router.get("/{user_quality_id}/overview")
def get_quality_overview(user_quality_id: str, user_id: str = Depends(get_current_user_id)):
    """Карточка качества -- read-model из forensic-аудита исходного Excel
    (лист «Аналитика», блок «Карточка качества»): само качество + вся
    статистика + последние проявления + разбивка по контексту действия
    (COUNTIFS/AVERAGEIFS по контексту в оригинале -- здесь GROUP BY)."""
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE uq.id = %s", (user_quality_id,))
        quality = cur.fetchone()
        if quality is None:
            api_error(404, "QUALITY_NOT_FOUND", "Качество не найдено в вашем наборе")

        cur.execute(
            """SELECT a.id AS action_id, a.name AS action_name, a.occurred_at,
                      qe.score, qe.comment
               FROM quality_expressions qe JOIN actions a ON a.id = qe.action_id
               WHERE qe.quality_id = %s
               ORDER BY a.occurred_at DESC, a.created_at DESC LIMIT 8""",
            (user_quality_id,),
        )
        recent_expressions = cur.fetchall()

        cur.execute(
            """SELECT ac.id AS context_id, ac.label AS context_label,
                      count(*) AS count, avg(qe.score) AS avg_score
               FROM quality_expressions qe
               JOIN actions a ON a.id = qe.action_id
               LEFT JOIN action_contexts ac ON ac.id = a.context_id
               WHERE qe.quality_id = %s
               GROUP BY ac.id, ac.label
               ORDER BY count DESC""",
            (user_quality_id,),
        )
        by_context = cur.fetchall()

    return {"quality": quality, "recent_expressions": recent_expressions, "by_context": by_context}


@router.patch("/{user_quality_id}", response_model=UserQualityOut)
def update_my_quality(user_quality_id: str, body: UserQualityManualIn, user_id: str = Depends(get_current_user_id)):
    # catalog_quality_id внутри PATCH не меняем -- смена привязки к другому
    # каталожному качеству это, по сути, удаление+добавление, не редактирование.
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """UPDATE user_qualities SET dev_priority_code=%s, focus_code=%s, dev_status_code=%s,
                                              current_level=%s, updated_at=now()
                   WHERE id=%s""",
                (body.dev_priority_code, body.focus_code, body.dev_status_code, body.current_level, user_quality_id),
            )
            if cur.rowcount == 0:
                api_error(404, "QUALITY_NOT_FOUND", "Качество не найдено в вашем наборе")
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE uq.id = %s", (user_quality_id,))
        return cur.fetchone()


@router.delete("/{user_quality_id}", status_code=204)
def remove_my_quality(user_quality_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute("DELETE FROM user_qualities WHERE id = %s", (user_quality_id,))
        if cur.rowcount == 0:
            api_error(404, "QUALITY_NOT_FOUND", "Качество не найдено в вашем наборе")
