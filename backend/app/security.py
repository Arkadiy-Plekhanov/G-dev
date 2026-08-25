from datetime import datetime, timedelta, timezone
import hashlib
import secrets

import bcrypt
from jose import JWTError, jwt

from app.config import settings

# passlib.CryptContext убран: свежие версии пакета bcrypt конфликтуют с
# внутренним self-test'ом passlib ("password cannot be longer than 72
# bytes" при попытке верифицировать ЛЮБОЙ пароль, даже короткий -- это
# баг совместимости версий, не наша логика). Прямой вызов bcrypt проще,
# meньше движущихся частей и не зависит от давно не обновлявшегося passlib.
# (password_hash в MVP не используется активно -- Google-only, -- но
# функции оставлены: колонка зарезервирована под будущие методы входа.)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except JWTError:
        return None


# ---------- refresh-токены ----------
# Хранится не сам токен, а его хэш (SHA-256) -- утечка БД не даёт
# готовых к использованию токенов, только их отпечатки.

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
