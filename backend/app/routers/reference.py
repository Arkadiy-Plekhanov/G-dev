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
