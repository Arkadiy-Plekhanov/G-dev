"""
Пул соединений + зависимость, которая на каждый запрос:
1) берёт соединение из пула,
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
"""
from contextlib import contextmanager
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from app.config import settings

_pool = ThreadedConnectionPool(minconn=1, maxconn=30, dsn=settings.database_url)


@contextmanager
def get_conn(user_id: Optional[str] = None):
    conn = _pool.getconn()
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
