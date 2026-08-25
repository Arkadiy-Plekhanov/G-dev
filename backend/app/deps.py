from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import api_error
from app.google_auth import verify_google_id_token
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    if creds is None:
        api_error(401, "UNAUTHORIZED", "Не авторизовано")
    user_id = decode_access_token(creds.credentials)
    if user_id is None:
        api_error(401, "TOKEN_INVALID", "Токен недействителен или истёк")
    return user_id


def get_google_verifier():
    """FastAPI-зависимость, а не прямой импорт в роутере -- чтобы тесты
    могли подменить именно эту границу (app.dependency_overrides), не
    трогая остальную логику auth-роутера. Реальный вызов к серверам
    Google из песочницы недоступен (нет сети); сама верификация
    закрыта официальной библиотекой Google и в отдельном тестировании
    со стороны продукта не нуждается."""
    return verify_google_id_token
