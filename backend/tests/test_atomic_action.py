"""Атомарное создание Action + N Quality Expressions одной транзакцией.
После ADR-001: is_relevant убрана, score обязателен всегда (существование
записи = релевантность)."""
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
def setup():
    def fake_verify(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"atomic-{uuid.uuid4()}",
                "email": f"atomic-{uuid.uuid4()}@example.com", "name": "Atomic Test",
                "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
    h = {"Authorization": f"Bearer {login['access_token']}"}

    catalog = client.get("/v1/catalog/qualities", headers=h).json()
    q1 = client.post("/v1/qualities", json={"catalog_quality_id": catalog[0]["id"]}, headers=h).json()
    q2 = client.post("/v1/qualities", json={"catalog_quality_id": catalog[1]["id"]}, headers=h).json()
    q3 = client.post("/v1/qualities", json={"catalog_quality_id": catalog[2]["id"]}, headers=h).json()

    yield client, h, [q1["id"], q2["id"], q3["id"]]
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


def test_atomic_create_action_with_three_qualities(setup):
    client, h, (q1, q2, q3) = setup
    r = client.post("/v1/actions/with-qualities", json={
        "name": "Провёл сложные переговоры", "occurred_at": "2026-08-22",
        "qualities": [
            {"quality_id": q1, "score": 4},
            {"quality_id": q2, "score": 3, "comment": "неплохо"},
            {"quality_id": q3, "score": 0, "comment": "проявилось в обратную сторону"},
        ],
    }, headers=h)
    assert r.status_code == 201
    action = r.json()
    assert action["quality_count"] == 3

    exprs = client.get(f"/v1/actions/{action['id']}/expressions", headers=h).json()
    assert len(exprs) == 3
    assert all("is_relevant" not in e for e in exprs)  # поле реально убрано, не просто скрыто


def test_missing_score_rejected(setup):
    """ADR-001: score обязателен всегда -- существование записи уже
    означает релевантность, отдельного «без оценки» состояния больше нет."""
    client, h, (q1, _, _) = setup
    r = client.post("/v1/actions/with-qualities", json={
        "name": "Действие без оценки", "occurred_at": "2026-08-22",
        "qualities": [{"quality_id": q1}],
    }, headers=h)
    assert r.status_code == 422

    actions = client.get("/v1/actions", headers=h).json()
    assert not any(a["name"] == "Действие без оценки" for a in actions)


def test_score_out_of_range_rejected(setup):
    client, h, (q1, _, _) = setup
    r = client.post("/v1/actions/with-qualities", json={
        "name": "Оценка вне диапазона", "occurred_at": "2026-08-22",
        "qualities": [{"quality_id": q1, "score": 5}],
    }, headers=h)
    assert r.status_code == 422


def test_atomic_rollback_on_duplicate_quality_in_request(setup):
    """Одно и то же качество дважды в одном запросе -- вся операция должна
    быть отклонена ДО записи чего-либо, включая само действие."""
    client, h, (q1, _, _) = setup
    r = client.post("/v1/actions/with-qualities", json={
        "name": "Плохой запрос", "occurred_at": "2026-08-22",
        "qualities": [
            {"quality_id": q1, "score": 3},
            {"quality_id": q1, "score": 4},
        ],
    }, headers=h)
    assert r.status_code == 422  # ловится ещё на Pydantic-валидации, до похода в БД

    actions = client.get("/v1/actions", headers=h).json()
    assert not any(a["name"] == "Плохой запрос" for a in actions)


def test_atomic_rollback_on_foreign_quality(setup):
    """Второе качество в запросе ссылается на несуществующий/чужой ID
    (composite FK) -- ошибку клиент заранее поймать не может, только БД.
    Первое качество валидно, но вся транзакция обязана откатиться целиком:
    действие не должно появиться вообще, а не наполовину."""
    client, h, (q1, _, _) = setup
    fake_other_quality_id = str(uuid.uuid4())
    r = client.post("/v1/actions/with-qualities", json={
        "name": "Действие с чужим качеством", "occurred_at": "2026-08-22",
        "qualities": [
            {"quality_id": q1, "score": 3},
            {"quality_id": fake_other_quality_id, "score": 2},
        ],
    }, headers=h)
    assert r.status_code == 400  # FK violation -> откат

    actions = client.get("/v1/actions", headers=h).json()
    assert not any(a["name"] == "Действие с чужим качеством" for a in actions)

    # И q1 тоже не должно было сохраниться как отдельное проявление где-либо
    my_qualities = client.get("/v1/qualities", headers=h).json()
    q1_stats = next(q for q in my_qualities if q["id"] == q1)
    assert q1_stats["expression_count"] in (None, 0)


def test_atomic_action_without_qualities_still_works(setup):
    """qualities: [] -- пустой список равнозначен обычному POST /actions,
    не должен требовать хотя бы одного качества."""
    client, h, _ = setup
    r = client.post("/v1/actions/with-qualities", json={
        "name": "Просто действие без качеств", "occurred_at": "2026-08-22", "qualities": [],
    }, headers=h)
    assert r.status_code == 201
    assert r.json()["quality_count"] == 0
