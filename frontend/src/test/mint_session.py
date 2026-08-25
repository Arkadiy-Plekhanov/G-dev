"""
Помощник для интеграционных тестов фронтенда: создаёт настоящего
пользователя в реальной БД и выдаёт настоящую пару access+refresh токенов
теми же функциями, что использует сам бэкенд (app.security).

Не имитация: тот же путь создания пользователя, что видел бы реальный
Google-логин, за вычетом самой невозможной здесь сетевой проверки токена
у Google (см. GoogleSignInButton.jsx и README о честной границе тестирования).
Каждый вызов создаёт НОВОГО пользователя (уникальный google_sub), чтобы
тесты не пересекались данными.
"""
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/home/claude/work/backend")

import psycopg2
import psycopg2.extras
from app.security import create_access_token, generate_refresh_token, hash_refresh_token

DSN = "host=127.0.0.1 dbname=selfdev user=app_writer password=change_me_in_production"


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
    refresh = generate_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=60)
    cur.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s,%s,%s)",
        (user_id, hash_refresh_token(refresh), expires_at),
    )
    conn.commit()

    print(json.dumps({"user_id": user_id, "email": email, "access_token": access, "refresh_token": refresh}))
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
