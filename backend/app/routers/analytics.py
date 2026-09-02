from fastapi import APIRouter, Depends

from app.db import get_conn
from app.deps import get_current_user_id

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/current-focus")
def current_focus(user_id: str = Depends(get_current_user_id)):
    """Топ фокуса -- read-model из forensic-аудита исходного Excel (лист
    «Аналитика», блок «Текущий фокус»): все качества со статусом
    focus_code='current_focus', со статистикой. Порядок -- по имени
    (простой, предсказуемый дефолт; в оригинале был порядок ввода
    строки, что не переносится осмысленно -- см. открытый вопрос в
    ADR v2 о ручном порядке фокуса)."""
    with get_conn(user_id) as cur:
        cur.execute(
            """SELECT uq.id, cq.name,
                      qs.avg_score_all_time, qs.avg_score_30d, qs.trend, qs.last_expressed_at
               FROM user_qualities uq
               JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
               LEFT JOIN quality_stats qs ON qs.quality_id = uq.id
               WHERE uq.focus_code = 'current_focus'
               ORDER BY cq.name->>'en'"""
        )
        return cur.fetchall()


@router.get("/data-quality-alerts")
def data_quality_alerts(user_id: str = Depends(get_current_user_id)):
    """Advisory-проверки (не блокирующие, только напоминания) -- то, что
    осталось «мягким» после Security Gate: жёсткие инварианты уже стали
    constraint'ами и просто не могут быть нарушены; это -- то, что
    физически нарушить можно, но стоит показать пользователю."""
    with get_conn(user_id) as cur:
        cur.execute("SELECT check_name, record_id, label FROM v_data_quality_alerts ORDER BY check_name")
        return cur.fetchall()
