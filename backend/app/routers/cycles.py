import uuid

import psycopg2
from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id
from app.errors import api_error, raise_from_db_error
from app.schemas import CycleIn, CycleOut

router = APIRouter(prefix="/cycles", tags=["cycles"])

_SELECT = "SELECT id, name, start_date, end_date, status_code, description, summary FROM development_cycles"


def _attached(cur, cycle_id: str):
    cur.execute(
        """SELECT g.id, g.name FROM cycle_goals cg JOIN goals g ON g.id = cg.goal_id
           WHERE cg.cycle_id = %s""",
        (cycle_id,),
    )
    goals = cur.fetchall()
    cur.execute(
        """SELECT uq.id, cq.name FROM cycle_qualities cqt
           JOIN user_qualities uq ON uq.id = cqt.quality_id
           JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
           WHERE cqt.cycle_id = %s""",
        (cycle_id,),
    )
    qualities = cur.fetchall()
    return goals, qualities


@router.get("", response_model=list[CycleOut])
def list_cycles(user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " ORDER BY start_date DESC NULLS LAST")
        return cur.fetchall()


@router.post("", status_code=201, response_model=CycleOut)
def create_cycle(body: CycleIn, user_id: str = Depends(get_current_user_id)):
    """Атомарно: цикл + все привязанные цели/качества одной транзакцией --
    тот же принцип, что и в /actions/with-qualities."""
    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO development_cycles (id, user_id, name, start_date, end_date,
                                                     status_code, description, summary)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (new_id, user_id, body.name, body.start_date, body.end_date,
                 body.status_code, body.description, body.summary),
            )
            for gid in body.goal_ids:
                cur.execute("INSERT INTO cycle_goals (user_id, cycle_id, goal_id) VALUES (%s,%s,%s)",
                            (user_id, new_id, gid))
            for qid in body.quality_ids:
                cur.execute("INSERT INTO cycle_qualities (user_id, cycle_id, quality_id) VALUES (%s,%s,%s)",
                            (user_id, new_id, qid))
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE id = %s", (new_id,))
        cycle = cur.fetchone()
        goals, qualities = _attached(cur, new_id)
    return {**cycle, "goals": goals, "qualities": qualities}


@router.get("/{cycle_id}", response_model=CycleOut)
def get_cycle(cycle_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE id = %s", (cycle_id,))
        cycle = cur.fetchone()
        if cycle is None:
            api_error(404, "CYCLE_NOT_FOUND", "Цикл не найден")
        goals, qualities = _attached(cur, cycle_id)
    return {**cycle, "goals": goals, "qualities": qualities}


@router.patch("/{cycle_id}", response_model=CycleOut)
def update_cycle(cycle_id: str, body: CycleIn, user_id: str = Depends(get_current_user_id)):
    """Обновляет сам цикл и полностью заменяет набор привязанных целей/
    качеств (проще и предсказуемее инкрементального add/remove для MVP)."""
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """UPDATE development_cycles SET name=%s, start_date=%s, end_date=%s,
                                                   status_code=%s, description=%s, summary=%s,
                                                   updated_at=now()
                   WHERE id=%s""",
                (body.name, body.start_date, body.end_date, body.status_code,
                 body.description, body.summary, cycle_id),
            )
            if cur.rowcount == 0:
                api_error(404, "CYCLE_NOT_FOUND", "Цикл не найден")
            cur.execute("DELETE FROM cycle_goals WHERE cycle_id = %s", (cycle_id,))
            cur.execute("DELETE FROM cycle_qualities WHERE cycle_id = %s", (cycle_id,))
            for gid in body.goal_ids:
                cur.execute("INSERT INTO cycle_goals (user_id, cycle_id, goal_id) VALUES (%s,%s,%s)",
                            (user_id, cycle_id, gid))
            for qid in body.quality_ids:
                cur.execute("INSERT INTO cycle_qualities (user_id, cycle_id, quality_id) VALUES (%s,%s,%s)",
                            (user_id, cycle_id, qid))
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE id = %s", (cycle_id,))
        cycle = cur.fetchone()
        # Привязки -- как в GET и POST. Раньше PATCH возвращал цикл БЕЗ них,
        # то есть форма редактирования получала пустые goals/qualities сразу
        # после успешного сохранения и показывала, будто привязки исчезли.
        goals, qualities = _attached(cur, cycle_id)
    return {**cycle, "goals": goals, "qualities": qualities}


@router.delete("/{cycle_id}", status_code=204)
def delete_cycle(cycle_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute("DELETE FROM development_cycles WHERE id = %s", (cycle_id,))
        if cur.rowcount == 0:
            api_error(404, "CYCLE_NOT_FOUND", "Цикл не найден")
