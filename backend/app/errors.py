import psycopg2
from fastapi import HTTPException, status


def api_error(status_code: int, code: str, message: str):
    """Единая форма ошибки для всего API: {"code": "...", "message": "..."}.
    code -- стабильный, машиночитаемый (для frontend/i18n), message -- для
    человека, на русском (перевод на конкретный язык -- задача frontend,
    ADR v2 §6: коды стабильны и не локализуются, тексты локализуются)."""
    raise HTTPException(status_code, {"code": code, "message": message})


# Известные ограничения БД -> стабильный код. Список не исчерпывающий --
# specific-конструкции покрыты, остальное падает в общий SQL_ERROR ниже,
# что честнее, чем выдумывать код для неизвестного случая.
_CONSTRAINT_CODES = {
    "goals_parent_owner": ("INVALID_REFERENCE", "Родительская цель не найдена или принадлежит другому пользователю"),
    "actions_goal_owner": ("INVALID_REFERENCE", "Цель не найдена или принадлежит другому пользователю"),
    "qexpr_action_owner": ("INVALID_REFERENCE", "Действие не найдено или принадлежит другому пользователю"),
    "qexpr_quality_owner": ("INVALID_REFERENCE", "Качество не найдено или принадлежит другому пользователю"),
    "cycle_goals_goal_owner": ("INVALID_REFERENCE", "Цель не найдена или принадлежит другому пользователю"),
    "cycle_goals_cycle_owner": ("INVALID_REFERENCE", "Цикл не найден или принадлежит другому пользователю"),
    "cycle_qualities_quality_owner": ("INVALID_REFERENCE", "Качество не найдено или принадлежит другому пользователю"),
    "cycle_qualities_cycle_owner": ("INVALID_REFERENCE", "Цикл не найден или принадлежит другому пользователю"),
    "reflections_goal_owner": ("INVALID_REFERENCE", "Цель не найдена или принадлежит другому пользователю"),
    "reflections_cycle_owner": ("INVALID_REFERENCE", "Цикл не найден или принадлежит другому пользователю"),
    "quality_expressions_unique_pair": ("QUALITY_ALREADY_IN_ACTION", "Это качество уже добавлено к этому действию"),
    "uq_user_qualities_catalog": ("QUALITY_ALREADY_ADOPTED", "Это качество уже есть в вашем наборе"),
    "one_active_cycle_per_user": ("ONE_ACTIVE_CYCLE_ALREADY_EXISTS", "У вас уже есть активный цикл — сначала завершите его"),
    "quality_expressions_score_check": ("INVALID_SCORE", "Оценка должна быть от 0 до 4"),
    "goals_dates_order": ("INVALID_DATE_RANGE", "Целевая дата не может быть раньше даты начала"),
    "cycles_dates_order": ("INVALID_DATE_RANGE", "Дата окончания не может быть раньше даты начала"),
    "goals_no_self_parent": ("GOAL_CYCLE_DETECTED", "Цель не может быть собственным родителем"),
}


def raise_from_db_error(e: psycopg2.Error):
    """Единая точка перевода ошибок Postgres (наши constraint'ы) в HTTP-ответы
    со стабильным кодом. БД остаётся источником истины по инвариантам --
    это только перевод её отказа в понятный, машиночитаемый ответ API, не
    дублирование самой проверки. Сырые DB-сообщения (имена констрейнтов,
    внутренние детали) не пробрасываются наружу -- только известные,
    заранее размеченные случаи."""
    constraint = getattr(e.diag, "constraint_name", None)
    if constraint and constraint in _CONSTRAINT_CODES:
        code, message = _CONSTRAINT_CODES[constraint]
        status_code = status.HTTP_409_CONFLICT if isinstance(e, psycopg2.errors.UniqueViolation) else status.HTTP_400_BAD_REQUEST
        api_error(status_code, code, message)

    if isinstance(e, psycopg2.errors.UniqueViolation):
        api_error(status.HTTP_409_CONFLICT, "DUPLICATE", "Такая запись уже существует")
    if isinstance(e, psycopg2.errors.ForeignKeyViolation):
        api_error(status.HTTP_400_BAD_REQUEST, "INVALID_REFERENCE", "Ссылка на несуществующую запись")
    if isinstance(e, psycopg2.errors.CheckViolation):
        api_error(status.HTTP_400_BAD_REQUEST, "VALIDATION_ERROR", "Значение не проходит проверку")
    if isinstance(e, psycopg2.errors.RaiseException):
        # Наш собственный RAISE EXCEPTION (например, goals_prevent_cycle) --
        # текст уже написан по-русски и безопасен для показа пользователю,
        # но код всё равно даём стабильный и предсказуемый.
        api_error(status.HTTP_400_BAD_REQUEST, "GOAL_CYCLE_DETECTED", str(e.diag.message_primary or e))
    api_error(status.HTTP_400_BAD_REQUEST, "SQL_ERROR", "Операция отклонена базой данных")
