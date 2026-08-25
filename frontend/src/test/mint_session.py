"""
Помощник для интеграционных тестов фронтенда: создаёт настоящего
пользователя в реальной БД и выдаёт настоящую пару access+refresh токенов.

Самодостаточен (в отличие от более ранней версии): НЕ импортирует
app.security из бэкенда -- у контейнера фронтенда физически нет исходников
бэкенда, только сам этот скрипт + psycopg2 + python-jose (см.
frontend/Dockerfile). Использует ровно ту же библиотеку (python-jose,
HS256) и ту же схему полей (sub/exp/type), что и настоящий
backend/app/security.py::create_access_token -- значит результат
gарантированно проходит проверку настоящего бэкенда, не только "похож
на токен".

Подключается к Postgres по имени сервиса Docker Compose (`postgres`,
не `127.0.0.1`) под той же ролью app_writer, что и сам бэкенд -- не
postgres-суперюзером, чтобы не давать тестовому окружению лишних прав.
JWT_SECRET и APP_WRITER_PASSWORD фронтенд-контейнер уже получает через
env_file в docker-compose.yml.
"""
import hashlib
import json
import os
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
from jose import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-secret-change-me")
DB_HOST = os.environ.get("POSTGRES_HOST", "postgres")
APP_WRITER_PASSWORD = os.environ.get("APP_WRITER_PASSWORD", "change_me_in_production")
DSN = f"host={DB_HOST} dbname=selfdev user=app_writer password={APP_WRITER_PASSWORD}"


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=60)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def main():
    conn = psycopg2.connect(DSN)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    user_id = str(uuid.uuid4())
    sub = f"frontend-test-{uuid.uuid4()}"
    email = f"{sub}@example.com"
    cur.execute(
        "INSERT INTO users (id, google_sub, email, display_name, locale) VALUES (%s,%s,%s,%s,'en')",
        (user_id, sub, email, "Frontend Test User"),
    )

    access = create_access_token(user_id)
    refresh = secrets.token_urlsafe(48)
    refresh_hash = hashlib.sha256(refresh.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=60)
    cur.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s,%s,%s)",
        (user_id, refresh_hash, expires_at),
    )
    conn.commit()

    print(json.dumps({"user_id": user_id, "email": email, "access_token": access, "refresh_token": refresh}))
    cur.close()
    conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
