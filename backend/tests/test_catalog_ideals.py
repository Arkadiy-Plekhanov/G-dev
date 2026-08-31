"""Тесты Stage 2: глобальный каталог, идеалы, путь «идеал» и путь «ручной»."""
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
def auth_client():
    def fake_verify(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"cat-{uuid.uuid4()}",
                "email": f"cat-{uuid.uuid4()}@example.com", "name": "Catalog Test",
                "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}
    yield client, headers
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


def test_catalog_qualities_has_full_flower_catalog(auth_client):
    """169 -- полный "Цветок духовных качеств" (миграция 12), без единой
    внецветочной добавки: composition идеалов Marcus Aurelius/Buddha/
    Nelson Mandela целиком на цветочных качествах (equanimity->balance-
    equilibrium, mindfulness->attentiveness, loving-kindness->kindness-
    love-of-good, reconciliation->peacefulness -- ближайшие по смыслу
    замены, не механическое переименование). Не MVP-набор из 25. Точное
    число, а не диапазон: любое отклонение означает, что каталог молча
    потерял или задвоил качество при пересидке -- лучше упасть здесь, чем
    узнать об этом от пользователя, листающего пустой поиск."""
    client, h = auth_client
    r = client.get("/v1/catalog/qualities", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 169
    slugs = {q["slug"] for q in body}
    assert {"wisdom", "courage", "love", "patience", "justice"} <= slugs
    assert len({q["group_id"] for q in body}) == 9


def test_catalog_ideals_has_3_with_compositions(auth_client):
    client, h = auth_client
    r = client.get("/v1/catalog/ideals", headers=h)
    assert r.status_code == 200
    ideals = r.json()
    assert len(ideals) == 3
    for ideal in ideals:
        assert len(ideal["qualities"]) >= 6
        assert ideal["qualities"][0]["rank"] == 1


def test_adopt_ideal_creates_full_composition_as_focus(auth_client):
    client, h = auth_client
    ideals = client.get("/v1/catalog/ideals", headers=h).json()
    marcus = next(i for i in ideals if i["slug"] == "marcus-aurelius")

    r = client.post("/v1/onboarding/adopt-ideal", json={"ideal_id": marcus["id"]}, headers=h)
    assert r.status_code == 201
    body = r.json()
    assert len(body["adopted_quality_ids"]) == len(marcus["qualities"]) == 6

    mine = client.get("/v1/qualities", headers=h).json()
    assert len(mine) == 6
    assert all(q["focus_code"] == "current_focus" for q in mine)
    assert all(q["source"] == "ideal" for q in mine)

    me = client.get("/v1/me", headers=h).json()
    # chosen_ideal_id не в MeOut -- проверяем через прямой SQL, что метка проставилась
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    cur.execute("SELECT chosen_ideal_id FROM users WHERE id = %s", (me["id"],))
    assert cur.fetchone()[0] == marcus["id"]
    conn.close()


def test_adopting_same_ideal_twice_is_idempotent(auth_client):
    client, h = auth_client
    ideals = client.get("/v1/catalog/ideals", headers=h).json()
    buddha = next(i for i in ideals if i["slug"] == "buddha")

    r1 = client.post("/v1/onboarding/adopt-ideal", json={"ideal_id": buddha["id"]}, headers=h)
    r2 = client.post("/v1/onboarding/adopt-ideal", json={"ideal_id": buddha["id"]}, headers=h)
    assert r1.status_code == 201 and r2.status_code == 201
    assert len(r2.json()["adopted_quality_ids"]) == 0
    assert r2.json()["already_had"] == len(buddha["qualities"])

    mine = client.get("/v1/qualities", headers=h).json()
    assert len(mine) == len(buddha["qualities"])  # не задвоилось


def test_manual_path_adopt_single_quality(auth_client):
    client, h = auth_client
    catalog = client.get("/v1/catalog/qualities", headers=h).json()
    love = next(q for q in catalog if q["slug"] == "love")

    r = client.post("/v1/qualities", json={
        "catalog_quality_id": love["id"], "focus_code": "current_focus",
        "dev_status_code": "forming", "current_level": 2,
    }, headers=h)
    assert r.status_code == 201
    assert r.json()["source"] == "manual"
    assert r.json()["name"]["en"] == "Love"


def test_manual_path_duplicate_quality_rejected(auth_client):
    client, h = auth_client
    catalog = client.get("/v1/catalog/qualities", headers=h).json()
    wisdom = next(q for q in catalog if q["slug"] == "wisdom")

    r1 = client.post("/v1/qualities", json={"catalog_quality_id": wisdom["id"]}, headers=h)
    r2 = client.post("/v1/qualities", json={"catalog_quality_id": wisdom["id"]}, headers=h)
    assert r1.status_code == 201
    assert r2.status_code == 409  # UNIQUE(user_id, catalog_quality_id)


def test_ideals_are_global_not_isolated_by_tenant(auth_client):
    """Каталог/идеалы -- общие reference-данные, не персональные: у второго
    пользователя тот же каталог виден без какой-либо изоляции."""
    client, h1 = auth_client

    def fake_verify2(id_token):
        return {"iss": "https://accounts.google.com", "sub": f"cat2-{uuid.uuid4()}",
                "email": f"cat2-{uuid.uuid4()}@example.com", "name": "Second", "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify2
    login2 = client.post("/v1/auth/google", json={"id_token": "y"}).json()
    h2 = {"Authorization": f"Bearer {login2['access_token']}"}

    r1 = client.get("/v1/catalog/ideals", headers=h1).json()
    r2 = client.get("/v1/catalog/ideals", headers=h2).json()
    assert {i["id"] for i in r1} == {i["id"] for i in r2}
