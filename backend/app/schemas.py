from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ---------- auth ----------
class GoogleAuthIn(BaseModel):
    id_token: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    locale: str
    timezone: str


# ---------- goals ----------
class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    parent_id: Optional[str] = None
    status_code: str = "active"
    priority_code: str = "p3_normal"
    start_date: Optional[date] = None
    target_date: Optional[date] = None
    progress_pct: Optional[float] = Field(default=None, ge=0, le=100)

    @field_validator("target_date")
    @classmethod
    def target_after_start(cls, v, info):
        start = info.data.get("start_date")
        if v and start and v < start:
            raise ValueError("target_date не может быть раньше start_date")
        return v


class GoalOut(BaseModel):
    id: str
    parent_id: Optional[str]
    name: str
    description: Optional[str]
    status_code: str
    priority_code: str
    start_date: Optional[date]
    target_date: Optional[date]
    progress_pct: Optional[float]
    level: Optional[int] = None
    path: Optional[str] = None
    child_goal_count: Optional[int] = None
    action_count: Optional[int] = None


# ---------- catalog & ideals (глобальные, read-only для приложения) ----------
class CatalogQualityOut(BaseModel):
    id: str
    slug: str
    name: dict           # {"en": "...", "ru": "..."}
    definition: dict
    group_id: Optional[int] = None


class IdealQualityOut(BaseModel):
    rank: int
    quality: CatalogQualityOut


class IdealOut(BaseModel):
    id: str
    slug: str
    name: dict
    bio: dict
    category: str
    qualities: list[IdealQualityOut] = []


# ---------- user_qualities (персональное принятие качества) ----------
class UserQualityManualIn(BaseModel):
    catalog_quality_id: str
    dev_priority_code: str = "p3_normal"
    focus_code: str = "not_in_focus"


class UserQualityPatchIn(BaseModel):
    """PATCH -- по-настоящему частичный: присылают только то, что меняют.

    Отдельная схема от UserQualityManualIn (та -- для создания) по двум
    причинам, обе из реального бага: в ней catalog_quality_id ОБЯЗАТЕЛЕН,
    хотя PATCH его сознательно не меняет -- то есть клиент был обязан
    прислать поле, которое всё равно игнорируется (запрос «убрать из
    фокуса» падал с 422). И все поля имели значения по умолчанию, из-за
    чего частичный запрос молча перезаписывал неприсланное дефолтом:
    сменил фокус -- потерял приоритет. None здесь означает «не трогать».
    """
    dev_priority_code: Optional[str] = None
    focus_code: Optional[str] = None


class AdoptIdealIn(BaseModel):
    ideal_id: str


class UserQualityOut(BaseModel):
    id: str
    catalog_quality_id: str
    name: dict            # из catalog_qualities, для отображения без второго запроса
    definition: dict      # оттуда же: карточка качества показывает определение
                          # и для принятого качества, не только для нового --
                          # иначе для «своих» качеств она выглядела бы иначе,
                          # чем для остальных, а это одна и та же карточка
    focus_code: str
    dev_priority_code: str  # записывался и через POST, и через PATCH, но наружу
                            # не отдавался: клиент не мог прочитать то, что сам
                            # же установил. Состояние, доступное на запись и
                            # недоступное на чтение -- тот же изъян, из-за
                            # которого убрали current_level/dev_status_code.
    source: str
    avg_score_all_time: Optional[float] = None
    avg_score_30d: Optional[float] = None
    trend: Optional[str] = None
    stability: Optional[str] = None
    confidence: Optional[str] = None
    last_expressed_at: Optional[date] = None # когда качество замечали в последний раз
    expression_count: Optional[int] = None   # число ступеней роста (основа среднего)
    inversion_count: Optional[int] = None    # обратные проявления -- вне шкалы роста
    inversion_count_30d: Optional[int] = None


# ---------- atomic action + nested expressions ----------
class ExpressionNestedIn(BaseModel):
    """Проявление качества внутри атомарного создания действия -- без
    action_id (он ещё не существует на момент запроса)."""
    quality_id: str
    score: int = Field(ge=0, le=4)
    comment: Optional[str] = None


class ActionWithExpressionsIn(BaseModel):
    """Атомарное создание: действие + N проявлений качеств одной операцией.
    Пользователь мыслит одним событием ('провёл переговоры, вот какие
    качества проявились и как'), а не серией независимых запросов --
    отдельные POST на каждое qualities/{id}/expressions оставляли окно,
    где сетевой сбой между вызовами давал частично записанное действие."""
    name: str = Field(min_length=1, max_length=500)
    occurred_at: date
    goal_id: Optional[str] = None
    description: Optional[str] = None
    context_id: Optional[int] = None
    result: Optional[str] = None
    note: Optional[str] = None
    status_code: str = "done"
    qualities: list[ExpressionNestedIn] = []

    @field_validator("qualities")
    @classmethod
    def no_duplicate_qualities(cls, v):
        ids = [q.quality_id for q in v]
        if len(ids) != len(set(ids)):
            raise ValueError("одно и то же качество указано в запросе дважды")
        return v


# ---------- actions ----------
class ActionIn(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    occurred_at: date
    goal_id: Optional[str] = None
    description: Optional[str] = None
    context_id: Optional[int] = None
    result: Optional[str] = None
    note: Optional[str] = None
    status_code: str = "done"


class ActionOut(BaseModel):
    id: str
    name: str
    occurred_at: date
    goal_id: Optional[str]
    description: Optional[str]
    context_id: Optional[int]
    status_code: str
    created_at: Optional[datetime] = None
    quality_count: Optional[int] = None
    avg_score: Optional[float] = None


# ---------- quality expressions ----------
class ExpressionIn(BaseModel):
    quality_id: str
    score: int = Field(ge=0, le=4)
    comment: Optional[str] = None


class ExpressionOut(BaseModel):
    id: str
    action_id: str
    quality_id: str
    score: int
    comment: Optional[str]


# ---------- reference ----------
class OptionOut(BaseModel):
    code: str
    label: str


class GroupOut(BaseModel):
    id: int
    code: str
    label: str


class ContextOut(BaseModel):
    id: int
    code: str
    label: str


# ---------- development cycles ----------
class CycleIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status_code: str = "planned"
    description: Optional[str] = None
    summary: Optional[str] = None
    goal_ids: list[str] = []
    quality_ids: list[str] = []

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        start = info.data.get("start_date")
        if v and start and v < start:
            raise ValueError("end_date не может быть раньше start_date")
        return v


class CycleOut(BaseModel):
    id: str
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    status_code: str
    description: Optional[str]
    summary: Optional[str]


# ---------- reflections ----------
class ReflectionIn(BaseModel):
    occurred_at: date
    reflection_type_code: str = "daily"
    goal_id: Optional[str] = None
    cycle_id: Optional[str] = None
    what_worked: Optional[str] = None
    what_did_not_work: Optional[str] = None
    qualities_observed_raw: Optional[str] = None
    insight: Optional[str] = None
    what_to_change: Optional[str] = None
    qualities_needing_attention_raw: Optional[str] = None
    what_stuck: Optional[str] = None
    next_cycle_change: Optional[str] = None
    # §1 обратной связи: "рефлексия без качеств — отдельна, рефлексия с
    # указанием качеств — качества регистрируются с привязкой к действию".
    # Не персистится как колонка reflections -- используется только в
    # момент создания, чтобы атомарно завести связанное action (см.
    # create_reflection). Пустой список -- легитимная чистая рефлексия
    # без залогированного поступка, не ошибка и не "забыли заполнить".
    qualities: list[ExpressionIn] = []


class ReflectionOut(BaseModel):
    id: str
    occurred_at: date
    reflection_type_code: str
    goal_id: Optional[str]
    cycle_id: Optional[str]
    what_worked: Optional[str]
    what_did_not_work: Optional[str]
    qualities_observed_raw: Optional[str]
    insight: Optional[str]
    what_to_change: Optional[str]
    qualities_needing_attention_raw: Optional[str]
    what_stuck: Optional[str]
    next_cycle_change: Optional[str]
    action_id: Optional[str] = None
