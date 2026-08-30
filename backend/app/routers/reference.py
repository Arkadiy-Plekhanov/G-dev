from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id

router = APIRouter(prefix="/reference", tags=["reference"])

# Реальный пробел, найденный при сборке фронтенда: формы (новое действие,
# новая цель, принятие качества) нуждаются в списках статусов/приоритетов/
# контекстов, а отдельного read-эндпоинта для option_lists/action_contexts/
# quality_groups не было -- этот роутер его закрывает.


@router.get("/options/{list_type}")
def get_options(list_type: str, _user_id: str = Depends(get_current_user_id)):
    """Один из семи открытых, дополняемых списков (goal_status, priority,
    action_status, quality_dev_status, quality_focus, reflection_type,
    cycle_status) -- см. option_lists в схеме."""
    with get_conn() as cur:
        cur.execute(
            "SELECT code, label FROM option_lists WHERE list_type = %s AND is_active ORDER BY sort_order",
            (list_type,),
        )
        return cur.fetchall()


@router.get("/action-contexts")
def get_action_contexts(_user_id: str = Depends(get_current_user_id)):
    with get_conn() as cur:
        cur.execute("SELECT id, code, label FROM action_contexts WHERE is_active ORDER BY sort_order")
        return cur.fetchall()


@router.get("/quality-groups")
def get_quality_groups(_user_id: str = Depends(get_current_user_id)):
    with get_conn() as cur:
        cur.execute("SELECT id, code, label FROM quality_groups WHERE is_active ORDER BY sort_order")
        return cur.fetchall()


@router.get("/score-legend")
def get_score_legend(_user_id: str = Depends(get_current_user_id)):
    """Шкала оценки проявления качества. Отдаётся из БД, а не хардкодится
    во фронтенде: названия ступеней -- доменный словарь продукта, они
    локализуются вместе с каталогом качеств и должны быть одинаковы для
    всех трёх клиентов (веб, мобильные, десктоп).

    is_growth_stage=false у единственной записи (score=0, "пошло иначе"):
    это не низшая ступень, а запись другого рода -- она не участвует в
    средних (см. quality_stats) и в интерфейсе должна быть отделена
    визуально, а не стоять первой в общем ряду."""
    with get_conn() as cur:
        cur.execute(
            "SELECT score, slug, name, description, is_growth_stage "
            "FROM score_legend ORDER BY score"
        )
        return cur.fetchall()
