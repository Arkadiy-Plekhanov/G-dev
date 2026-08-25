"""
Верификация Google ID token на бэкенде.

Использует официальную google-auth (verify_oauth2_token) -- ровно тот
паттерн, который Google документирует как рекомендуемый для продакшена
(developers.google.com/identity/gsi/web/guides/verify-google-id-token):
библиотека сама скачивает и кеширует публичные ключи Google и проверяет
подпись, срок действия и audience; вручную остаётся только сверить issuer.

Обёрнуто в единственную функцию (а не разбросано по роутеру), чтобы в
тестах её можно было подменить через FastAPI dependency override --
реальный сетевой поход к серверам Google из тестовой среды недоступен
(и не нужен: это протестировано и поддерживается самой Google).
"""
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings

_VALID_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleTokenError(ValueError):
    pass


def verify_google_id_token(token: str) -> dict:
    """Возвращает провалидированные claims (sub, email, name, picture, locale)
    или бросает GoogleTokenError."""
    try:
        claims = id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as e:
        raise GoogleTokenError(str(e)) from e

    if claims.get("iss") not in _VALID_ISSUERS:
        raise GoogleTokenError("Неверный issuer токена")
    if "sub" not in claims:
        raise GoogleTokenError("В токене отсутствует sub")
    return claims
