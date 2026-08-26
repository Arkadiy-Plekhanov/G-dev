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
        return {"iss": "https://accounts.google.com", "sub": f"ref-{uuid.uuid4()}",
                "email": f"ref-{uuid.uuid4()}@example.com", "name": "Ref Test", "picture": None, "locale": "en"}
    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    client = TestClient(app)
    login = client.post("/v1/auth/google", json={"id_token": "x"}).json()
    yield client, {"Authorization": f"Bearer {login['access_token']}"}
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


def test_goal_status_options(auth_client):
    client, h = auth_client
    r = client.get("/v1/reference/options/goal_status", headers=h)
    assert r.status_code == 200
    codes = {o["code"] for o in r.json()}
    assert codes == {"idea", "active", "paused", "achieved", "cancelled"}


def test_priority_options_shared_across_goals_and_qualities(auth_client):
    client, h = auth_client
    r = client.get("/v1/reference/options/priority", headers=h)
    assert len(r.json()) == 4


def test_action_contexts(auth_client):
    client, h = auth_client
    r = client.get("/v1/reference/action-contexts", headers=h)
    assert r.status_code == 200
    assert len(r.json()) == 10


def test_quality_groups(auth_client):
    client, h = auth_client
    r = client.get("/v1/reference/quality-groups", headers=h)
    assert r.status_code == 200
    assert len(r.json()) == 9
