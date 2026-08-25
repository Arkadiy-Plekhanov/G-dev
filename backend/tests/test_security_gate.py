"""
Security Gate — cross-tenant attack test suite (13/13 из матрицы research-отчёта).

Каждый тест открывает СВОЁ соединение к БД под ролью app_writer (той же,
что использует бэкенд), ставит SET LOCAL app.current_user_id ровно так,
как это делает app/db.py, и проверяет, что чужие данные либо невидимы
(RLS), либо запись отклоняется (composite ownership FK / CHECK / триггер
цикла). Это тест самой БД, а не FastAPI-кода — если кто-то в API забудет
добавить WHERE user_id=..., этот набор всё равно обязан быть зелёным.

Запуск: pytest test_security_gate.py -v
"""
import uuid

import psycopg2
import psycopg2.extras
import pytest

DSN = "host=127.0.0.1 dbname=selfdev user=app_writer password=change_me_in_production"


def conn_as(user_id: str | None):
    c = psycopg2.connect(DSN)
    c.autocommit = False
    cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if user_id is not None:
        cur.execute("SELECT set_config('app.current_user_id', %s, false)", (user_id,))
    return c, cur


@pytest.fixture
def tenants():
    """Два независимых пользователя, у каждого — своя цель/качество/действие/
    проявление/цикл/рефлексия. Создаётся и удаляется вне RLS-контекста напрямую."""
    root = psycopg2.connect(DSN)
    root.autocommit = True
    rc = root.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def make(tag):
        uid = str(uuid.uuid4())
        rc.execute(
            "INSERT INTO users (id, email, password_hash, display_name) VALUES (%s,%s,'h',%s)",
            (uid, f"{tag}-{uid}@test.dev", tag),
        )
        rc.execute("SELECT set_config('app.current_user_id', %s, false)", (uid,))
        gid = str(uuid.uuid4())
        rc.execute(
            "INSERT INTO goals (id,user_id,name,status_code,priority_code) VALUES (%s,%s,%s,'active','p1_critical')",
            (gid, uid, f"{tag} goal"),
        )
        # user_qualities теперь ссылается на глобальный каталог (Stage 2) --
        # берём первую попавшуюся каталожную запись, для теста изоляции
        # конкретное качество не имеет значения.
        rc.execute("SELECT id FROM catalog_qualities LIMIT 1")
        catalog_quality_id = rc.fetchone()["id"]
        qid = str(uuid.uuid4())
        rc.execute(
            "INSERT INTO user_qualities (id,user_id,catalog_quality_id,dev_priority_code,focus_code,dev_status_code) "
            "VALUES (%s,%s,%s,'p3_normal','not_in_focus','undeveloped')",
            (qid, uid, catalog_quality_id),
        )
        aid = str(uuid.uuid4())
        rc.execute(
            "INSERT INTO actions (id,user_id,goal_id,name,occurred_at,status_code) "
            "VALUES (%s,%s,%s,%s,current_date,'done')",
            (aid, uid, gid, f"{tag} action"),
        )
        cid = str(uuid.uuid4())
        rc.execute(
            "INSERT INTO development_cycles (id,user_id,name,start_date,status_code) "
            "VALUES (%s,%s,%s,current_date,'planned')",
            (cid, uid, f"{tag} cycle"),
        )
        rid = str(uuid.uuid4())
        rc.execute(
            "INSERT INTO reflections (id,user_id,occurred_at,reflection_type_code) "
            "VALUES (%s,%s,current_date,'daily')",
            (rid, uid),
        )
        return dict(user_id=uid, goal_id=gid, quality_id=qid, action_id=aid, cycle_id=cid, reflection_id=rid)

    A, B = make("A"), make("B")
    yield A, B
    rc.execute("DELETE FROM users WHERE id IN (%s,%s)", (A["user_id"], B["user_id"]))
    root.close()


# ---------- 1-3: чтение/изменение/удаление чужой строки ----------

def test_01_cannot_read_others_goal(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    cur.execute("SELECT * FROM goals WHERE id = %s", (B["goal_id"],))
    assert cur.fetchone() is None
    c.rollback(); c.close()


def test_02_cannot_update_others_action(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    cur.execute("UPDATE actions SET name = 'hacked' WHERE id = %s", (B["action_id"],))
    assert cur.rowcount == 0
    c.commit(); c.close()


def test_03_cannot_delete_others_action(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    cur.execute("DELETE FROM actions WHERE id = %s", (B["action_id"],))
    assert cur.rowcount == 0
    c.commit(); c.close()


# ---------- 4-5: expression, связывающий across владельцев ----------

def test_04_cannot_link_own_action_to_others_quality(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        cur.execute(
            "INSERT INTO quality_expressions (user_id,action_id,quality_id,score) "
            "VALUES (%s,%s,%s,3)",
            (A["user_id"], A["action_id"], B["quality_id"]),
        )
    c.rollback(); c.close()


def test_05_cannot_link_others_action_to_own_quality(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        cur.execute(
            "INSERT INTO quality_expressions (user_id,action_id,quality_id,score) "
            "VALUES (%s,%s,%s,3)",
            (A["user_id"], B["action_id"], A["quality_id"]),
        )
    c.rollback(); c.close()


# ---------- 6: parent_id чужой цели ----------

def test_06_cannot_set_parent_to_others_goal(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        cur.execute("UPDATE goals SET parent_id = %s WHERE id = %s", (B["goal_id"], A["goal_id"]))
    c.rollback(); c.close()


# ---------- 7: чужие цели/качества в своём цикле ----------

def test_07_cannot_add_others_goal_to_own_cycle(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        cur.execute(
            "INSERT INTO cycle_goals (user_id,cycle_id,goal_id) VALUES (%s,%s,%s)",
            (A["user_id"], A["cycle_id"], B["goal_id"]),
        )
    c.rollback(); c.close()


# ---------- 8: reflection на чужой cycle/goal ----------

def test_08_cannot_link_reflection_to_others_cycle(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        cur.execute(
            "UPDATE reflections SET cycle_id = %s WHERE id = %s",
            (B["cycle_id"], A["reflection_id"]),
        )
    c.rollback(); c.close()


# ---------- 9: запрос без установленного контекста ----------

def test_09_no_context_sees_nothing(tenants):
    A, B = tenants
    c, cur = conn_as(None)
    cur.execute("SELECT count(*) AS n FROM goals")
    assert cur.fetchone()["n"] == 0
    c.rollback(); c.close()


# ---------- 10: подделка user_id в INSERT ----------

def test_10_cannot_forge_user_id_on_insert(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        cur.execute(
            "INSERT INTO goals (user_id,name,status_code,priority_code) VALUES (%s,'forged','active','p1_critical')",
            (B["user_id"],),
        )
    c.rollback(); c.close()


# ---------- 11: JOIN своей и чужой таблицы ----------

def test_11_join_does_not_leak(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    cur.execute(
        "SELECT g.id FROM goals g JOIN actions a ON a.goal_id = g.id WHERE a.id = %s",
        (B["action_id"],),
    )
    assert cur.fetchone() is None
    c.rollback(); c.close()


# ---------- 12: VIEW не даёт статистику по чужим данным ----------

def test_12_views_do_not_leak(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    cur.execute("SELECT * FROM quality_stats WHERE quality_id = %s", (B["quality_id"],))
    assert cur.fetchone() is None
    cur.execute("SELECT * FROM goal_hierarchy WHERE id = %s", (B["goal_id"],))
    assert cur.fetchone() is None
    c.rollback(); c.close()


# ---------- 13: легитимная запись по-прежнему проходит (контроль) ----------

def test_13_legitimate_same_owner_write_succeeds(tenants):
    A, B = tenants
    c, cur = conn_as(A["user_id"])
    cur.execute(
        "INSERT INTO quality_expressions (user_id,action_id,quality_id,score) "
        "VALUES (%s,%s,%s,3) RETURNING id",
        (A["user_id"], A["action_id"], A["quality_id"]),
    )
    assert cur.fetchone() is not None
    c.rollback(); c.close()  # rollback -- не засоряем фикстурные данные
