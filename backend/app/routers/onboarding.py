import psycopg2
from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id
from app.errors import api_error, raise_from_db_error
from app.schemas import AdoptIdealIn

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/adopt-ideal", status_code=201)
def adopt_ideal(body: AdoptIdealIn, user_id: str = Depends(get_current_user_id)):
    """Путь (а) из трёх равноценных путей построения фокуса: пользователь
    выбирает Идеал -- система принимает ВСЕ качества его композиции как
    текущий фокус. Идеал -- генератор композиции, не постоянная связь
    (ADR v2 §2): user_qualities создаются один раз сейчас, дальнейшее
    редактирование фокуса Идеала на уже принятые качества не влияет.
    users.chosen_ideal_id -- только UX-метка "мой идеал" на момент выбора."""
    with get_conn(user_id) as cur:
        cur.execute(
            "SELECT iq.catalog_quality_id FROM ideal_qualities iq WHERE iq.ideal_id = %s ORDER BY iq.rank",
            (body.ideal_id,),
        )
        quality_ids = [r["catalog_quality_id"] for r in cur.fetchall()]
        if not quality_ids:
            api_error(404, "IDEAL_NOT_FOUND", "Идеал не найден или пуст")

        created = []
        try:
            for cqid in quality_ids:
                cur.execute(
                    """INSERT INTO user_qualities (user_id, catalog_quality_id, dev_priority_code,
                                                     focus_code, dev_status_code, source, source_ideal_id)
                       VALUES (%s,%s,'p3_normal','current_focus','undeveloped','ideal',%s)
                       ON CONFLICT (user_id, catalog_quality_id) DO NOTHING
                       RETURNING id""",
                    (user_id, cqid, body.ideal_id),
                )
                row = cur.fetchone()
                if row:
                    created.append(row["id"])
            cur.execute("UPDATE users SET chosen_ideal_id = %s, updated_at = now() WHERE id = %s",
                        (body.ideal_id, user_id))
        except psycopg2.Error as e:
            raise_from_db_error(e)

    return {"ideal_id": body.ideal_id, "adopted_quality_ids": created,
            "already_had": len(quality_ids) - len(created)}
