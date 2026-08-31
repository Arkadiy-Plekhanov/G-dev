"""Stage 3: полный API v1 -- циклы, рефлексия, read-model карточки,
экспорт/удаление аккаунта, пагинация, доменные коды ошибок."""
import uuid

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app.deps import get_google_verifier
from app.main import app

import os

# host=127.0.0.1 -- правильно в песочнице и в CI (GitHub Actions чужой сервис
# Postgres тоже маппится на 127.0.0.1 на том же раннере), но НЕ в Docker
# Compose: внутри контейнера backend 127.0.0.1 -- это loopback самого
# контейнера, Postgres там нет физически (он в отдельном контейнере
# `postgres`, доступном по имени сервиса). TEST_DB_HOST переопределяет это
# для Docker -- см. docker-compose.yml.
DSN = f"host={os.environ.get('TEST_DB_HOST', '127.0.0.1')} dbname=selfdev user=app_writer password=change_me_in_production"


@pytest.fixture
def scenario():
    """Одна цель, одно качество, три действия: два под целью (оценки 4 и 4),
    одно без цели (оценка 1) -- даёт предсказуемый avg_in_goal=4.0 против
    overall_avg=3.0 (diff +1.0 >= порога 0.3 -> 'above_usual'). Два разных
    контекста -- для проверки разбивки по контексту."""
    def fake_verify(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"s3-{uuid.uuid4()}",
                "email": f"s3-{uuid.uuid4()}@example.com", "name": "Stage3 Test",
                "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
    h = {"Authorization": f"Bearer {login['access_token']}"}

    goal = client.post("/v1/goals", json={"name": "Провести конференцию", "status_code": "active",
                                            "priority_code": "p2_high"}, headers=h).json()
    catalog = client.get("/v1/catalog/qualities", headers=h).json()
    q = client.post("/v1/qualities", json={"catalog_quality_id": catalog[0]["id"],
                                             "focus_code": "current_focus"}, headers=h).json()

    a1 = client.post("/v1/actions/with-qualities", json={
        "name": "Выступил на совещании", "occurred_at": "2026-08-10", "goal_id": goal["id"], "context_id": 1,
        "qualities": [{"quality_id": q["id"], "score": 4}],
    }, headers=h).json()
    a2 = client.post("/v1/actions/with-qualities", json={
        "name": "Провёл переговоры", "occurred_at": "2026-08-15", "goal_id": goal["id"], "context_id": 2,
        "qualities": [{"quality_id": q["id"], "score": 4}],
    }, headers=h).json()
    a3 = client.post("/v1/actions/with-qualities", json={
        "name": "Отдельное действие без цели", "occurred_at": "2026-08-01", "context_id": 1,
        "qualities": [{"quality_id": q["id"], "score": 1}],
    }, headers=h).json()

    yield client, h, {"goal": goal, "quality": q, "actions": [a1, a2, a3]}
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


# ---------- cycles ----------

def test_create_cycle_atomic_with_goal_and_quality(scenario):
    client, h, ctx = scenario
    r = client.post("/v1/cycles", json={
        "name": "Осень 2026", "start_date": "2026-08-01", "status_code": "active",
        "goal_ids": [ctx["goal"]["id"]], "quality_ids": [ctx["quality"]["id"]],
    }, headers=h)
    assert r.status_code == 201
    body = r.json()
    assert len(body["goals"]) == 1 and len(body["qualities"]) == 1

    fetched = client.get(f"/v1/cycles/{body['id']}", headers=h).json()
    assert fetched["goals"][0]["id"] == ctx["goal"]["id"]


def test_only_one_active_cycle_per_user(scenario):
    client, h, _ = scenario
    r1 = client.post("/v1/cycles", json={"name": "Цикл 1", "status_code": "active"}, headers=h)
    assert r1.status_code == 201

    r2 = client.post("/v1/cycles", json={"name": "Цикл 2", "status_code": "active"}, headers=h)
    assert r2.status_code == 409
    assert r2.json()["detail"]["code"] == "ONE_ACTIVE_CYCLE_ALREADY_EXISTS"


def test_cycle_update_replaces_associations(scenario):
    client, h, ctx = scenario
    cycle = client.post("/v1/cycles", json={"name": "Test", "goal_ids": [ctx["goal"]["id"]]}, headers=h).json()
    assert len(cycle["goals"]) == 1

    client.patch(f"/v1/cycles/{cycle['id']}", json={"name": "Test", "goal_ids": []}, headers=h)
    fetched = client.get(f"/v1/cycles/{cycle['id']}", headers=h).json()
    assert len(fetched["goals"]) == 0


def test_cycle_not_found_structured_error(scenario):
    client, h, _ = scenario
    r = client.get(f"/v1/cycles/{uuid.uuid4()}", headers=h)
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "CYCLE_NOT_FOUND"


# ---------- reflections ----------

def test_reflection_crud(scenario):
    client, h, ctx = scenario
    r = client.post("/v1/reflections", json={
        "occurred_at": "2026-08-16", "reflection_type_code": "weekly", "goal_id": ctx["goal"]["id"],
        "what_worked": "Держался спокойно", "qualities_observed_raw": "Мужество, немного Терпения",
    }, headers=h)
    assert r.status_code == 201
    rid = r.json()["id"]

    fetched = client.get(f"/v1/reflections/{rid}", headers=h).json()
    assert fetched["what_worked"] == "Держался спокойно"

    updated = client.patch(f"/v1/reflections/{rid}", json={
        "occurred_at": "2026-08-16", "reflection_type_code": "weekly", "what_worked": "Изменено",
    }, headers=h)
    assert updated.json()["what_worked"] == "Изменено"

    deleted = client.delete(f"/v1/reflections/{rid}", headers=h)
    assert deleted.status_code == 204
    assert client.get(f"/v1/reflections/{rid}", headers=h).status_code == 404


# ---------- read-model overviews ----------

def test_goal_overview_recent_actions_and_baseline_comparison(scenario):
    client, h, ctx = scenario
    r = client.get(f"/v1/goals/{ctx['goal']['id']}/overview", headers=h)
    assert r.status_code == 200
    body = r.json()

    assert body["goal"]["action_count"] == 2  # a1, a2 -- НЕ a3 (без цели)
    assert len(body["recent_actions"]) == 2
    assert body["recent_actions"][0]["name"] == "Провёл переговоры"  # позже по occurred_at -> первым

    quality_row = body["qualities"][0]
    assert quality_row["count_in_goal"] == 2
    assert float(quality_row["avg_in_goal"]) == 4.0
    assert quality_row["vs_baseline"] == "above_usual"  # 4.0 против общего (4+4+1)/3=3.0, diff=1.0 >= 0.3
    # quality_id (не catalog_quality_id!) -- фронтенду нужен именно id
    # ПРИНЯТОГО качества пользователя, чтобы ссылка на карточку качества
    # с личной статистикой (/qualities/{id}) вообще открывалась, а не
    # 404-илась: раньше наружу отдавался только catalog_quality_id.
    assert quality_row["quality_id"] == ctx["quality"]["id"]


def test_quality_overview_context_breakdown(scenario):
    client, h, ctx = scenario
    r = client.get(f"/v1/qualities/{ctx['quality']['id']}/overview", headers=h)
    assert r.status_code == 200
    body = r.json()

    assert len(body["recent_expressions"]) == 3
    contexts = {row["context_id"]: row["count"] for row in body["by_context"]}
    assert contexts.get(1) == 2  # a1 (context_id=1) + a3 (context_id=1)
    assert contexts.get(2) == 1  # a2 (context_id=2)


def test_current_focus_leaderboard(scenario):
    client, h, ctx = scenario
    r = client.get("/v1/analytics/current-focus", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert any(item["id"] == ctx["quality"]["id"] for item in body)


def test_data_quality_alerts_shows_action_without_goal(scenario):
    client, h, ctx = scenario
    r = client.get("/v1/analytics/data-quality-alerts", headers=h)
    assert r.status_code == 200
    alerts = r.json()
    assert any(a["check_name"] == "action_missing_goal" and a["record_id"] == ctx["actions"][2]["id"]
               for a in alerts)


# ---------- export / delete ----------

def test_export_account_contains_all_data(scenario):
    client, h, ctx = scenario
    r = client.get("/v1/me/export", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert len(body["goals"]) == 1
    assert len(body["qualities"]) == 1
    assert len(body["actions"]) == 3
    assert len(body["quality_expressions"]) == 3


def test_delete_account_cascades_and_invalidates_refresh(scenario):
    client, h, ctx = scenario

    r = client.delete("/v1/me", headers=h)
    assert r.status_code == 204

    # Тот же access-токен технически ещё не истёк (JWT stateless), но
    # пользователя больше нет -- /me обязан отдать 404, не 500 и не старые данные.
    me = client.get("/v1/me", headers=h)
    assert me.status_code == 404

    # Данные реально удалены, не просто скрыты
    assert client.get("/v1/goals", headers=h).json() == []


# ---------- pagination ----------

def test_actions_pagination_cursor(scenario):
    client, h, ctx = scenario
    page1 = client.get("/v1/actions?limit=2", headers=h).json()
    assert len(page1) == 2
    assert page1[0]["name"] == "Провёл переговоры"  # самое позднее occurred_at

    last = page1[-1]
    page2 = client.get(
        f"/v1/actions?limit=2&before_occurred_at={last['occurred_at']}&before_created_at={last['created_at']}",
        headers=h,
    ).json()
    assert len(page2) == 1
    assert page2[0]["name"] == "Отдельное действие без цели"  # самое раннее


def test_actions_limit_capped_at_100():
    """limit не может быть произвольно большим -- Query(le=100)."""
    def fake_verify(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"cap-{uuid.uuid4()}",
                "email": f"cap-{uuid.uuid4()}@example.com", "name": "Cap Test", "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
    h = {"Authorization": f"Bearer {login['access_token']}"}

    r = client.get("/v1/actions?limit=99999", headers=h)
    assert r.status_code == 422
    app.dependency_overrides.clear()


# ---------- structured error codes ----------

def test_goal_not_found_has_structured_code(scenario):
    client, h, _ = scenario
    r = client.get(f"/v1/goals/{uuid.uuid4()}", headers=h)
    assert r.status_code == 404
    assert r.json()["detail"] == {"code": "GOAL_NOT_FOUND", "message": "Цель не найдена"}


def test_quality_already_adopted_has_structured_code(scenario):
    client, h, ctx = scenario
    catalog = client.get("/v1/catalog/qualities", headers=h).json()
    same = next(c for c in catalog if c["id"] == ctx["quality"]["catalog_quality_id"])
    r = client.post("/v1/qualities", json={"catalog_quality_id": same["id"]}, headers=h)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "QUALITY_ALREADY_ADOPTED"
