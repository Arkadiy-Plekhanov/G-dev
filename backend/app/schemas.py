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
    recent_scores: Optional[list[int]] = None  # последние оценки, новые->старые
                                               # (фронт разворачивает для спарклайна)


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
    # Ключ идемпотентности (ADR v2 §5). Необязателен: без него каждый
    # запрос создаёт новое действие, как и раньше. С ним повтор с тем же
    # ключом вернёт уже созданное -- защита от даблтапа и офлайн-ретрая.
    client_request_id: Optional[str] = Field(default=None, max_length=200)
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
    label: dict          # {"en": ..., "ru": ...} -- как у catalog_qualities.name:
                         # сервер отдаёт весь объект, язык выбирает клиент


class GroupOut(BaseModel):
    id: int
    code: str
    label: dict          # {"en": ..., "ru": ...} -- как у catalog_qualities.name:
                         # сервер отдаёт весь объект, язык выбирает клиент


class ContextOut(BaseModel):
    id: int
    code: str
    label: dict          # {"en": ..., "ru": ...} -- как у catalog_qualities.name:
                         # сервер отдаёт весь объект, язык выбирает клиент


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


class CycleGoalRef(BaseModel):
    """Цель, привязанная к сезону -- только то, что нужно для списка."""
    id: str
    name: str


class CycleQualityRef(BaseModel):
    """Качество, привязанное к сезону. id -- ПРИНЯТОГО качества
    (user_qualities), не каталожного: ссылка ведёт на карточку со
    статистикой."""
    id: str
    name: dict


class CycleOut(BaseModel):
    id: str
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    status_code: str
    description: Optional[str]
    summary: Optional[str]
    # Привязанные цели и качества. Поля были в ответе, но НЕ объявлены в
    # схеме -- и после подключения response_model FastAPI начал их молча
    # отфильтровывать: экран сезона остался бы без списков, без единой
    # ошибки в логах. Поймано тестами при подключении схемы -- ровно тот
    # случай, ради которого схемы и нужны.
    goals: list[CycleGoalRef] = []
    qualities: list[CycleQualityRef] = []


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


# ---------- сводные ответы (read-model для экранов) ----------
# Эти схемы описывают ответы, которые собираются из нескольких запросов и
# не соответствуют ни одной таблице напрямую. Именно они дольше всего
# оставались без response_model -- и именно они ломались чаще всего:
# пропавшая колонка проявлялась не ошибкой бэкенда, а «Failed to fetch» в
# браузере, далеко от причины.
#
# ВАЖНО про recent_scores: ряд оценок для спарклайна, порядок «новые
# первыми» (клиент разворачивает). ОХВАТ ЗАВИСИТ ОТ ЭНДПОИНТА и по самим
# данным неразличим -- два одинаковых массива чисел означают разное:
#   * GoalQualityStat.recent_scores  -- только проявления ВНУТРИ этой цели
#   * FocusQualityOut.recent_scores  -- ГЛОБАЛЬНО, вся история качества
# Клиент, перепутавший их, нарисует правдоподобный, но неверный график.


class ActionSummaryOut(BaseModel):
    """Действие в списке на карточке цели -- без описания и заметок."""
    id: str
    name: str
    occurred_at: date
    context_id: Optional[int] = None
    avg_score: Optional[float] = None
    quality_count: Optional[int] = None


class GoalQualityStat(BaseModel):
    """Качество в разрезе ОДНОЙ цели: как оно проявляется здесь против
    своего обычного уровня."""
    catalog_quality_id: str
    quality_id: str
    name: dict
    count_in_goal: int
    avg_in_goal: float
    recent_scores: Optional[list[int]] = None   # охват: только эта цель
    avg_score_all_time: Optional[float] = None
    vs_baseline: Optional[str] = None           # above_usual | below_usual | as_usual


class GoalSubtreeOut(BaseModel):
    """Сводка по цели И всем её подцелям вместе. None, если подцелей нет --
    иначе это была бы точная копия чисел самой цели."""
    action_count: int
    descendant_goal_count: int
    qualities: list[GoalQualityStat] = []


class GoalChildOut(BaseModel):
    """Прямая подцель, кратко. Не рекурсивно: у своей карточки подцель
    получит такую же секцию, дублировать её здесь незачем."""
    id: str
    name: str
    status_code: str
    action_count: int
    child_goal_count: int


class GoalOverviewOut(BaseModel):
    goal: GoalOut
    recent_actions: list[ActionSummaryOut] = []
    qualities: list[GoalQualityStat] = []
    subtree: Optional[GoalSubtreeOut] = None
    children: list[GoalChildOut] = []


class QualityExpressionOut(BaseModel):
    """Проявление качества в конкретном действии."""
    action_id: str
    action_name: str
    occurred_at: date
    score: int
    comment: Optional[str] = None


class QualityContextStat(BaseModel):
    """Разбивка качества по контекстам действия («где чаще проявляется»)."""
    context_id: Optional[int] = None
    context_label: Optional[dict] = None   # {"en": ..., "ru": ...}
    count: int
    avg_score: float


class QualityOverviewOut(BaseModel):
    quality: UserQualityOut
    recent_expressions: list[QualityExpressionOut] = []
    by_context: list[QualityContextStat] = []


class FocusQualityOut(BaseModel):
    """Строка списка «в фокусе» на главном экране."""
    id: str
    name: dict
    avg_score_all_time: Optional[float] = None
    avg_score_30d: Optional[float] = None
    trend: Optional[str] = None
    last_expressed_at: Optional[date] = None
    recent_scores: Optional[list[int]] = None   # охват: ГЛОБАЛЬНЫЙ


class DataQualityAlertOut(BaseModel):
    """Сигнал гигиены данных -- инструмент владельца, не пользовательский
    экран (см. §5 спецификации Фазы 1)."""
    check_name: str
    record_id: str
    label: Optional[str] = None


class ScoreLegendOut(BaseModel):
    """Ступени шкалы роста из БД -- клиенты берут названия отсюда, а не
    хардкодят. is_growth_stage=false у 0: он ВНЕ шкалы роста."""
    score: int
    slug: str
    name: dict
    description: dict
    is_growth_stage: bool


class AdoptIdealOut(BaseModel):
    # ideal_id роутер возвращал всегда, но схема его не объявляла -- и
    # после подключения response_model поле стало молча вырезаться.
    # Тот же класс, что был у CycleOut: схема, отстающая от реального
    # ответа, не просто неточна, она УДАЛЯЕТ данные.
    ideal_id: str
    adopted_quality_ids: list[str] = []
    already_had: int


class HealthOut(BaseModel):
    """Проверка живости -- используется Render для health check."""
    status: str
