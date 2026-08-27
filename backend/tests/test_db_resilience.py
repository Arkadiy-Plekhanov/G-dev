"""Проверка pre-ping/retry в db.py -- не полагаемся на то, что "наверное
сработает", раз это специально написано под задокументированное поведение
Neon (обрыв простаивающих соединений при autosuspend), которое в песочнице
живьём не воспроизвести (нет реального Neon). Вместо этого симулируем ТОТ
ЖЕ класс отказа с помощью pg_terminate_backend -- сервер обрывает
конкретное соединение сам, это даёт тот же OperationalError, что и реальный
обрыв от Neon, а не client-side close() (тот дал бы другой класс исключения,
InterfaceError, и не проверял бы код по-настоящему)."""
import os
import time

import psycopg2
import pytest

DSN = f"host={os.environ.get('TEST_DB_HOST', '127.0.0.1')} dbname=selfdev user=app_writer password=change_me_in_production"


def test_stale_connection_is_detected_and_replaced_transparently():
    from app.db import _get_healthy_conn, _pool

    # Берём соединение из пула штатно, узнаём его backend PID, возвращаем
    # обратно -- пул считает его совершенно живым.
    conn = _pool.getconn()
    with conn.cursor() as cur:
        cur.execute("SELECT pg_backend_pid()")
        pid = cur.fetchone()[0]
    conn.commit()
    _pool.putconn(conn)

    # "Роняем" это соединение с СЕРВЕРНОЙ стороны -- ровно то, что Neon
    # делает своим простаивающим соединениям при autosuspend.
    admin = psycopg2.connect(DSN)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("SELECT pg_terminate_backend(%s)", (pid,))
    admin.close()
    time.sleep(0.3)  # дать серверу время фактически закрыть соединение

    # _get_healthy_conn обязана либо вытащить то же самое (уже мёртвое)
    # соединение и молча заменить его на рабочее, либо сразу получить
    # другое -- в любом случае результат обязан быть РАБОЧИМ соединением,
    # без исключения наружу.
    healthy = _get_healthy_conn()
    with healthy.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone()[0] == 1
    healthy.commit()
    _pool.putconn(healthy)


def test_get_conn_survives_a_terminated_connection_end_to_end():
    """То же самое, но через настоящий get_conn(), как его использует
    остальное приложение -- не только внутреннюю функцию."""
    from app.db import get_conn, _pool

    conn = _pool.getconn()
    with conn.cursor() as cur:
        cur.execute("SELECT pg_backend_pid()")
        pid = cur.fetchone()[0]
    conn.commit()
    _pool.putconn(conn)

    admin = psycopg2.connect(DSN)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("SELECT pg_terminate_backend(%s)", (pid,))
    admin.close()
    time.sleep(0.3)

    with get_conn() as cur:
        cur.execute("SELECT 1 AS ok")
        assert cur.fetchone()["ok"] == 1
