"""
Тесты Google-only auth поверх реального Postgres и реального FastAPI-приложения
(TestClient -- полноценный ASGI-запрос, не имитация). Единственное, что
подменяется через dependency override, -- сама верификация Google ID token:
сетевой поход к серверам Google из тестовой среды недоступен, а сама
верификация уже протестирована и поддерживается библиотекой google-auth
(см. app/google_auth.py). Всё остальное -- find-or-create, выдача JWT,
ротация refresh-токена, RLS-контекст -- реальное, без подмен.
"""
import uuid

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app.deps import get_google_verifier
from app.main import app

DSN = "host=127.0.0.1 dbname=selfdev user=app_writer password=change_me_in_production"


def fake_claims(sub: str, email: str = None, name: str = "Test User"):
    return {
        "iss": "https://accounts.google.com",
        "sub": sub,
        "email": email or f"{sub}@example.com",
        "email_verified": True,
        "name": name,
        "picture": "https://example.com/pic.jpg",
        "locale": "en",
    }


@pytest.fixture
def client_with_google(monkeypatch):
    """TestClient с подменённым Google-верификатором: возвращает claims,
    заданные тестом, вместо похода в сеть."""
    state = {"claims": None}

    def fake_verify(id_token: str):
        if state["claims"] is None:
            from app.google_auth import GoogleTokenError
            raise GoogleTokenError("no claims configured")
        return state["claims"]

    app.dependency_overrides[get_google_verifier] = lambda: fake_verify
    yield TestClient(app), state
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup_test_users():
    yield
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    conn.cursor().execute("DELETE FROM users WHERE email LIKE '%@example.com'")
    conn.close()


def test_first_login_creates_user(client_with_google):
    client, state = client_with_google
    sub = f"sub-{uuid.uuid4()}"
    state["claims"] = fake_claims(sub)

    r = client.post("/v1/auth/google", json={"id_token": "whatever"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body and "refresh_token" in body

    me = client.get("/v1/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == f"{sub}@example.com"


def test_second_login_same_sub_reuses_user(client_with_google):
    client, state = client_with_google
    sub = f"sub-{uuid.uuid4()}"
    state["claims"] = fake_claims(sub)

    r1 = client.post("/v1/auth/google", json={"id_token": "t1"})
    me1 = client.get("/v1/me", headers={"Authorization": f"Bearer {r1.json()['access_token']}"}).json()

    r2 = client.post("/v1/auth/google", json={"id_token": "t2"})  # второй вход тем же аккаунтом
    me2 = client.get("/v1/me", headers={"Authorization": f"Bearer {r2.json()['access_token']}"}).json()

    assert me1["id"] == me2["id"], "один и тот же google_sub обязан вести на одного и того же пользователя"


def test_invalid_google_token_rejected(client_with_google):
    client, state = client_with_google
    state["claims"] = None  # верификатор бросит GoogleTokenError
    r = client.post("/v1/auth/google", json={"id_token": "bad"})
    assert r.status_code == 401


def test_protected_route_without_token_rejected(client_with_google):
    client, _ = client_with_google
    r = client.get("/v1/goals")
    assert r.status_code == 401


def test_refresh_rotates_and_old_token_stops_working(client_with_google):
    client, state = client_with_google
    state["claims"] = fake_claims(f"sub-{uuid.uuid4()}")
    login = client.post("/v1/auth/google", json={"id_token": "t"}).json()
    old_refresh = login["refresh_token"]

    r = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200
    new_pair = r.json()
    assert new_pair["refresh_token"] != old_refresh

    # старый refresh-токен больше не должен работать -- он использован (ротация)
    r2 = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 401


def test_reused_old_refresh_token_revokes_whole_session(client_with_google):
    """Reuse-detection: если предъявлен уже прокрученный refresh-токен,
    это признак кражи -- ВСЕ активные токены пользователя должны быть сожжены,
    включая тот, что был выдан при последней легитимной ротации."""
    client, state = client_with_google
    state["claims"] = fake_claims(f"sub-{uuid.uuid4()}")
    login = client.post("/v1/auth/google", json={"id_token": "t"}).json()
    old_refresh = login["refresh_token"]

    rotated = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh}).json()
    legit_new_refresh = rotated["refresh_token"]

    # Атакующий предъявляет УЖЕ использованный старый токен ещё раз
    replay = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert replay.status_code == 401

    # Даже легитимный, честно выданный на последнем шаге токен теперь тоже мёртв
    legit_attempt = client.post("/v1/auth/refresh", json={"refresh_token": legit_new_refresh})
    assert legit_attempt.status_code == 401


def test_logout_revokes_refresh_token(client_with_google):
    client, state = client_with_google
    state["claims"] = fake_claims(f"sub-{uuid.uuid4()}")
    login = client.post("/v1/auth/google", json={"id_token": "t"}).json()

    r = client.post("/v1/auth/logout", json={"refresh_token": login["refresh_token"]})
    assert r.status_code == 204

    r2 = client.post("/v1/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r2.status_code == 401
