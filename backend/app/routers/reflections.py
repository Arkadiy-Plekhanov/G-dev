import uuid

import psycopg2
from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id
from app.errors import api_error, raise_from_db_error
from app.schemas import ReflectionIn, ReflectionOut

router = APIRouter(prefix="/reflections", tags=["reflections"])

_COLUMNS = """id, occurred_at, reflection_type_code, goal_id, cycle_id, what_worked,
              what_did_not_work, qualities_observed_raw, insight, what_to_change,
              qualities_needing_attention_raw, what_stuck, next_cycle_change"""


@router.get("", response_model=list[ReflectionOut])
def list_reflections(user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM reflections ORDER BY occurred_at DESC, created_at DESC LIMIT 50")
        return cur.fetchall()


@router.post("", response_model=ReflectionOut, status_code=201)
def create_reflection(body: ReflectionIn, user_id: str = Depends(get_current_user_id)):
    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO reflections (id, user_id, occurred_at, reflection_type_code, goal_id, cycle_id,
                                             what_worked, what_did_not_work, qualities_observed_raw, insight,
                                             what_to_change, qualities_needing_attention_raw, what_stuck,
                                             next_cycle_change)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (new_id, user_id, body.occurred_at, body.reflection_type_code, body.goal_id, body.cycle_id,
                 body.what_worked, body.what_did_not_work, body.qualities_observed_raw, body.insight,
                 body.what_to_change, body.qualities_needing_attention_raw, body.what_stuck,
                 body.next_cycle_change),
            )
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM reflections WHERE id = %s", (new_id,))
        return cur.fetchone()


@router.get("/{reflection_id}", response_model=ReflectionOut)
def get_reflection(reflection_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM reflections WHERE id = %s", (reflection_id,))
        row = cur.fetchone()
    if row is None:
        api_error(404, "REFLECTION_NOT_FOUND", "Рефлексия не найдена")
    return row


@router.patch("/{reflection_id}", response_model=ReflectionOut)
def update_reflection(reflection_id: str, body: ReflectionIn, user_id: str = Depends(get_current_user_id)):
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """UPDATE reflections SET occurred_at=%s, reflection_type_code=%s, goal_id=%s, cycle_id=%s,
                                           what_worked=%s, what_did_not_work=%s, qualities_observed_raw=%s,
                                           insight=%s, what_to_change=%s, qualities_needing_attention_raw=%s,
                                           what_stuck=%s, next_cycle_change=%s, updated_at=now()
                   WHERE id=%s""",
                (body.occurred_at, body.reflection_type_code, body.goal_id, body.cycle_id,
                 body.what_worked, body.what_did_not_work, body.qualities_observed_raw, body.insight,
                 body.what_to_change, body.qualities_needing_attention_raw, body.what_stuck,
                 body.next_cycle_change, reflection_id),
            )
            if cur.rowcount == 0:
                api_error(404, "REFLECTION_NOT_FOUND", "Рефлексия не найдена")
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM reflections WHERE id = %s", (reflection_id,))
        return cur.fetchone()


@router.delete("/{reflection_id}", status_code=204)
def delete_reflection(reflection_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute("DELETE FROM reflections WHERE id = %s", (reflection_id,))
        if cur.rowcount == 0:
            api_error(404, "REFLECTION_NOT_FOUND", "Рефлексия не найдена")
