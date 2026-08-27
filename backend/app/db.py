"""
Пул соединений + зависимость, которая на каждый запрос:
1) берёт соединение из пула (с pre-ping и retry -- см. _get_healthy_conn),
2) открывает транзакцию,
3) если пользователь аутентифицирован — SET LOCAL app.current_user_id
   (transaction-scoped, поэтому не протекает между запросами через тот же
   переиспользуемый в пуле коннект),
4) отдаёт курсор эндпоинту,
5) commit при успехе / rollback при исключении,
6) возвращает соединение в пул.

RLS-политики в БД -- это не украшение поверх фильтров в запросах, а
самостоятельный уровень защиты: даже если в конкретном запросе забыть
WHERE user_id = ..., Postgres всё равно не отдаст чужие строки (см. README,
раздел "Проверено вживую").

connect_timeout=15 и pre-ping -- не подстраховка "на всякий случай", а
прямое следствие документированного поведения Neon (Tier 2 -- бесплатный
compute на autosuspend): "Neon automatically suspends idle computes after
5 minutes... Existing idle connections are terminated when the compute
suspends" (neon.com/guides/building-resilient-applications-with-postgres).
Без этого первый запрос после любой паузы (для стейджинга, который
открывают раз в день, это норма, не исключение) падал бы с
OperationalError вместо прозрачного переподключения. Neon сама
рекомендует именно эту пару: connect_timeout >= 10-15 сек + pre-ping
перед использованием соединения из пула.
"""
import time
from contextlib import contextmanager
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from app.config import settings

_pool = ThreadedConnectionPool(
    minconn=1, maxconn=30, dsn=settings.database_url, connect_timeout=15
)


def _get_healthy_conn(max_attempts: int = 3):
    """Отдаёт заведомо живое соединение. Два разных отказа обрабатываются
    по-разному: (а) сам _pool.getconn() не смог создать/выдать соединение
    (Neon compute ещё просыпается, connect_timeout это обычно поглощает,
    но не всегда) -- пробуем снова; (б) выданное соединение оказалось
    "мёртвым" (Neon оборвал его во время простоя ДО этого запроса) --
    закрываем его явно (close=True -- не возвращаем труп обратно в пул,
    иначе он будет выдаваться снова и снова) и берём другое."""
    last_error: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            conn = _pool.getconn()
        except psycopg2.OperationalError as e:
            last_error = e
            time.sleep(0.5)
            continue
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.rollback()  # откатываем сам ping -- не оставляем висящую транзакцию
            return conn
        except psycopg2.OperationalError as e:
            _pool.putconn(conn, close=True)
            last_error = e
            time.sleep(0.5)
    raise last_error


@contextmanager
def get_conn(user_id: Optional[str] = None):
    conn = _get_healthy_conn()
    try:
        conn.autocommit = False
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if user_id is not None:
                cur.execute("SELECT set_config('app.current_user_id', %s, true)", (user_id,))
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)
