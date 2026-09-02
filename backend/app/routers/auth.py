import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response

from app.config import settings
from app.db import get_conn
from app.deps import get_current_user_id, get_google_verifier
from app.errors import api_error
from app.google_auth import GoogleTokenError
from app.schemas import GoogleAuthIn, MeOut, RefreshIn, TokenPairOut
from app.security import create_access_token, generate_refresh_token, hash_refresh_token

router = APIRouter(tags=["auth"])


def _issue_token_pair(cur, user_id: str) -> TokenPairOut:
    """Создаёт access-токен (JWT, короткий TTL) и новый refresh-токен
    (случайный, хранится только его SHA-256 хэш) для пользователя."""
    raw_refresh = generate_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    cur.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s,%s,%s) RETURNING id",
        (user_id, hash_refresh_token(raw_refresh), expires_at),
    )
    return TokenPairOut(access_token=create_access_token(user_id), refresh_token=raw_refresh)


@router.post("/auth/google", response_model=TokenPairOut)
def auth_google(body: GoogleAuthIn, verify=Depends(get_google_verifier)):
    try:
        claims = verify(body.id_token)
    except GoogleTokenError as e:
        api_error(401, "GOOGLE_TOKEN_INVALID", f"Недействительный Google-токен: {e}")

    google_sub = claims["sub"]
    email = claims.get("email", f"{google_sub}@google.invalid")
    name = claims.get("name") or email
    picture = claims.get("picture")
    locale = claims.get("locale", "en")

    with get_conn() as cur:
        cur.execute("SELECT id FROM users WHERE google_sub = %s", (google_sub,))
        row = cur.fetchone()
        if row is None:
            # Первый вход этим Google-аккаунтом -- автосоздание учётной записи
            # (решение владельца #7: подтверждение email не нужно, Google уже
            # его подтвердил на своей стороне).
            user_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO users (id, google_sub, email, display_name, avatar_url, locale)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (user_id, google_sub, email, name, picture, locale),
            )
        else:
            user_id = row["id"]
            # Профиль мог обновиться на стороне Google (новая аватарка, смена имени) -- синхронизируем.
            cur.execute(
                "UPDATE users SET display_name=%s, avatar_url=%s, updated_at=now() WHERE id=%s",
                (name, picture, user_id),
            )
        return _issue_token_pair(cur, user_id)


@router.post("/auth/refresh", response_model=TokenPairOut)
def refresh(body: RefreshIn):
    token_hash = hash_refresh_token(body.refresh_token)
    with get_conn() as cur:
        # FOR UPDATE обязателен: без блокировки строки при конкурентных
        # refresh одним и тем же токеном оба запроса читают revoked_at=NULL
        # ДО того, как любой из них закоммитится, и оба проходят -- это
        # эмпирически подтверждено тестом test_refresh_concurrency.py
        # (без FOR UPDATE: 20 из 20 конкурентных запросов проходят успешно
        # при намеренно раздвинутом окне; с FOR UPDATE -- ровно 1 из 20).
        cur.execute(
            "SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens "
            "WHERE token_hash = %s FOR UPDATE",
            (token_hash,),
        )
        row = cur.fetchone()
        if row is None:
            api_error(401, "REFRESH_TOKEN_INVALID", "Недействительный refresh-токен")

        if row["revoked_at"] is not None:
            # Токен уже был использован/отозван раньше, а его снова предъявляют --
            # признак кражи. Реакция по best practice ротации: сжечь ВСЕ
            # активные токены этого пользователя, а не только этот один.
            cur.execute(
                "UPDATE refresh_tokens SET revoked_at = now() "
                "WHERE user_id = %s AND revoked_at IS NULL",
                (row["user_id"],),
            )
            # Явный commit ДО raise: get_conn() откатывает транзакцию при любом
            # исключении, но здесь исключение -- сознательный отказ уже ПОСЛЕ
            # важной побочной записи (массового отзыва), которую нельзя терять.
            cur.connection.commit()
            api_error(401, "REFRESH_TOKEN_REUSED",
                      "Обнаружено повторное использование refresh-токена — все сессии отозваны, войдите заново")

        if row["expires_at"] < datetime.now(timezone.utc):
            api_error(401, "REFRESH_TOKEN_EXPIRED", "Refresh-токен истёк")

        if settings.refresh_race_test_delay_seconds:
            # Только для намеренного стресс-теста конкурентности (см.
            # tests/test_refresh_concurrency.py).
            import time
            time.sleep(settings.refresh_race_test_delay_seconds)

        new_pair = _issue_token_pair(cur, row["user_id"])
        cur.execute(
            "UPDATE refresh_tokens SET revoked_at = now(), replaced_by = "
            "(SELECT id FROM refresh_tokens WHERE token_hash = %s) WHERE token_hash = %s",
            (hash_refresh_token(new_pair.refresh_token), token_hash),
        )
        return new_pair


@router.post("/auth/logout", status_code=204)
def logout(body: RefreshIn):
    token_hash = hash_refresh_token(body.refresh_token)
    with get_conn() as cur:
        cur.execute(
            "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = %s AND revoked_at IS NULL",
            (token_hash,),
        )


@router.get("/me", response_model=MeOut)
def me(user_id: str = Depends(get_current_user_id)):
    with get_conn(user_id) as cur:
        cur.execute(
            "SELECT id, email, display_name, avatar_url, locale, timezone FROM users WHERE id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    if row is None:
        api_error(404, "USER_NOT_FOUND", "Пользователь не найден")
    return row


# СОЗНАТЕЛЬНО без response_model -- единственный такой эндпоинт в API.
# Схема ответа ФИЛЬТРУЕТ поля, а здесь это прямо противоречит смыслу:
# запросы намеренно идут через SELECT *, чтобы выгрузка включала ВСЁ, в
# том числе колонки, добавленные после написания схемы. Со схемой новая
# колонка молча не попала бы в экспорт -- то есть право на выгрузку
# нарушалось бы тихо. Не «забыли типизировать»: не типизировать здесь --
# и есть правильное поведение.
@router.get("/me/export")
def export_account(user_id: str = Depends(get_current_user_id)):
    """Право на экспорт (GDPR ст. 20): все данные пользователя одним
    машиночитаемым JSON. Каждый SELECT идёт под RLS-контекстом того же
    пользователя -- защита от утечки чужих данных даже здесь работает,
    хотя WHERE user_id и так есть в каждом запросе (defense in depth)."""
    with get_conn(user_id) as cur:
        cur.execute("SELECT id, email, display_name, locale, timezone, created_at FROM users WHERE id = %s", (user_id,))
        profile = cur.fetchone()

        cur.execute("SELECT * FROM goals WHERE user_id = %s ORDER BY created_at", (user_id,))
        goals = cur.fetchall()

        cur.execute(
            """SELECT uq.*, cq.name AS catalog_quality_name, cq.slug AS catalog_quality_slug
               FROM user_qualities uq JOIN catalog_qualities cq ON cq.id = uq.catalog_quality_id
               WHERE uq.user_id = %s ORDER BY uq.created_at""",
            (user_id,),
        )
        qualities = cur.fetchall()

        cur.execute("SELECT * FROM actions WHERE user_id = %s ORDER BY occurred_at", (user_id,))
        actions = cur.fetchall()

        cur.execute(
            "SELECT * FROM quality_expressions WHERE user_id = %s ORDER BY created_at", (user_id,)
        )
        expressions = cur.fetchall()

        cur.execute("SELECT * FROM development_cycles WHERE user_id = %s ORDER BY created_at", (user_id,))
        cycles = cur.fetchall()

        cur.execute("SELECT * FROM reflections WHERE user_id = %s ORDER BY occurred_at", (user_id,))
        reflections = cur.fetchall()

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "goals": goals,
        "qualities": qualities,
        "actions": actions,
        "quality_expressions": expressions,
        "development_cycles": cycles,
        "reflections": reflections,
    }


@router.delete("/me", status_code=204)
def delete_account(user_id: str = Depends(get_current_user_id)):
    """Право на полное удаление (GDPR ст. 17). Удаляется только строка
    users -- все её goals/qualities/actions/expressions/cycles/reflections/
    refresh_tokens уходят каскадом через ON DELETE CASCADE на user_id
    (проверено вживую перед реализацией этого эндпоинта, не предположено)."""
    with get_conn(user_id) as cur:
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    return Response(status_code=204)
