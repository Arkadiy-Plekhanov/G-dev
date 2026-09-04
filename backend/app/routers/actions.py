from datetime import date

import psycopg2
from fastapi import APIRouter, Depends, Query
import uuid

from app.db import get_conn
from app.deps import get_current_user_id
from app.errors import api_error, raise_from_db_error
from app.schemas import ActionIn, ActionOut, ActionWithExpressionsIn, ExpressionIn, ExpressionOut

router = APIRouter(tags=["actions"])

_SELECT = """
    SELECT a.id, a.name, a.occurred_at, a.goal_id, a.description, a.context_id, a.status_code,
           a.created_at, ast.quality_count, ast.avg_score
    FROM actions a
    LEFT JOIN action_stats ast ON ast.action_id = a.id
"""


@router.get("/actions", response_model=list[ActionOut])
def list_actions(
    limit: int = Query(default=20, ge=1, le=100),
    before_occurred_at: date | None = None,
    before_created_at: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """Курсорная пагинация по (occurred_at, created_at) -- тот же тай-брейк,
    что и в основной сортировке ленты (occurred_at DESC, created_at DESC),
    а не искусственный id. Первая страница: без курсора. Следующая:
    before_occurred_at/before_created_at из последнего элемента предыдущей
    страницы."""
    with get_conn(user_id) as cur:
        if before_occurred_at is not None and before_created_at is not None:
            cur.execute(
                _SELECT + """ WHERE (a.occurred_at, a.created_at) < (%s, %s)
                              ORDER BY a.occurred_at DESC, a.created_at DESC LIMIT %s""",
                (before_occurred_at, before_created_at, limit),
            )
        else:
            cur.execute(_SELECT + " ORDER BY a.occurred_at DESC, a.created_at DESC LIMIT %s", (limit,))
        return cur.fetchall()


@router.post("/actions", response_model=ActionOut, status_code=201)
def create_action(body: ActionIn, user_id: str = Depends(get_current_user_id)):
    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO actions (id, user_id, goal_id, name, occurred_at, description,
                                         context_id, result, note, status_code)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (new_id, user_id, body.goal_id, body.name, body.occurred_at, body.description,
                 body.context_id, body.result, body.note, body.status_code),
            )
    except psycopg2.errors.UniqueViolation:
        # Гонка: два одинаковых запроса пришли одновременно, проверка выше
        # обоих не поймала, и уникальный индекс отсёк второй. Отдаём то,
        # что записал победитель -- для клиента результат тот же.
        with get_conn(user_id) as cur:
            cur.execute(_SELECT + " WHERE a.client_request_id = %s", (body.client_request_id,))
            existing = cur.fetchone()
        if existing:
            return existing
        raise
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE a.id = %s", (new_id,))
        return cur.fetchone()


@router.post("/actions/with-qualities", response_model=ActionOut, status_code=201)
def create_action_with_qualities(body: ActionWithExpressionsIn, user_id: str = Depends(get_current_user_id)):
    """Основной сценарий ежедневной практики: действие и ВСЕ его проявления
    качеств создаются одной DB-транзакцией. Либо всё сохраняется, либо
    ничего -- сетевой сбой посреди записи не может оставить действие без
    части качеств.

    Идемпотентно по client_request_id (ADR v2 §5). Клиент генерирует ключ
    один раз на попытку записи и повторяет с ТЕМ ЖЕ ключом при ретрае --
    повторный запрос возвращает уже созданное действие, а не второе такое
    же. Это не про чистоту таблицы: дубль попадает в средние оценки, в
    тренды и в сравнение «выше/ниже обычного», то есть искажает ровно то,
    ради чего продукт существует. Без ключа поведение прежнее -- каждый
    запрос создаёт новое действие."""
    if body.client_request_id:
        # Проверка ДО вставки: обычный случай ретрая, когда первый запрос
        # успел записаться, а ответ не дошёл.
        with get_conn(user_id) as cur:
            cur.execute(_SELECT + " WHERE a.client_request_id = %s", (body.client_request_id,))
            existing = cur.fetchone()
            if existing:
                return existing

    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO actions (id, user_id, goal_id, name, occurred_at, description,
                                         context_id, result, note, status_code, client_request_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (new_id, user_id, body.goal_id, body.name, body.occurred_at, body.description,
                 body.context_id, body.result, body.note, body.status_code, body.client_request_id),
            )
            for q in body.qualities:
                cur.execute(
                    """INSERT INTO quality_expressions (user_id, action_id, quality_id, score, comment)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (user_id, new_id, q.quality_id, q.score, q.comment),
                )
            # Один и тот же курсор/соединение/транзакция для действия и всех
            # проявлений -- при любой ошибке get_conn() откатит ВСЁ.
    except psycopg2.Error as e:
        raise_from_db_error(e)
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE a.id = %s", (new_id,))
        return cur.fetchone()


@router.get("/actions/{action_id}", response_model=ActionOut)
def get_action(action_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(_SELECT + " WHERE a.id = %s", (action_id,))
        row = cur.fetchone()
    if row is None:
        api_error(404, "ACTION_NOT_FOUND", "Действие не найдено")
    return row


@router.get("/actions/{action_id}/expressions", response_model=list[ExpressionOut])
def list_expressions(action_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(
            "SELECT id, action_id, quality_id, score, comment "
            "FROM quality_expressions WHERE action_id = %s",
            (action_id,),
        )
        return cur.fetchall()


@router.post("/actions/{action_id}/expressions", response_model=ExpressionOut, status_code=201)
def add_expression(action_id: str, body: ExpressionIn, user_id: str = Depends(get_current_user_id)):
    new_id = str(uuid.uuid4())
    try:
        with get_conn(user_id) as cur:
            cur.execute(
                """INSERT INTO quality_expressions (id, user_id, action_id, quality_id, score, comment)
                   VALUES (%s,%s,%s,%s,%s,%s)
                   RETURNING id, action_id, quality_id, score, comment""",
                (new_id, user_id, action_id, body.quality_id, body.score, body.comment),
            )
            return cur.fetchone()
    except psycopg2.Error as e:
        raise_from_db_error(e)


@router.delete("/expressions/{expression_id}", status_code=204)
def delete_expression(expression_id: str, user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute("DELETE FROM quality_expressions WHERE id = %s", (expression_id,))
        if cur.rowcount == 0:
            api_error(404, "EXPRESSION_NOT_FOUND", "Запись не найдена")
