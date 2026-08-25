BEGIN;

-- ---------- users -> OAuth-only ----------
ALTER TABLE users
    ADD COLUMN google_sub text UNIQUE,
    ADD COLUMN avatar_url text,
    ADD COLUMN locale     text NOT NULL DEFAULT 'en',
    ADD COLUMN timezone   text NOT NULL DEFAULT 'UTC';

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- password_hash остаётся в схеме как зарезервированное поле под будущие методы
-- входа (решение владельца #7); в MVP всегда NULL для новых пользователей.
-- Инвариант "хоть какой-то способ входа обязателен" -- на уровне БД, не только приложения:
ALTER TABLE users
    ADD CONSTRAINT users_has_auth_method CHECK (google_sub IS NOT NULL OR password_hash IS NOT NULL);

-- email больше НЕ является ключом идентичности (решение ADR v2 §4: "email
-- ... может меняться, не является ключом"). Единственный стабильный
-- идентификатор -- google_sub. Email у пользователя Google-аккаунта
-- теоретически может повториться/смениться; уникальность на этом поле
-- была унаследована от старой email+password-модели и больше не верна.
ALTER TABLE users DROP CONSTRAINT users_email_key;

-- ---------- refresh-токены с ротацией ----------
-- НЕ под RLS: та же причина, что у users -- поиск идёт по случайному
-- неугадываемому хэшу токена ДО того, как известен current_user_id
-- (классическая курица-и-яйцо для аутентификационного слоя, а не
-- доменных данных). Защита -- точность запросов и то, что token_hash
-- практически невозможно подобрать (256 бит энтропии).
CREATE TABLE refresh_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   text NOT NULL UNIQUE,        -- SHA-256 от токена; сырой токен в БД не хранится
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz,
    replaced_by  uuid REFERENCES refresh_tokens(id)  -- цепочка ротации, нужна для reuse-detection
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

COMMIT;

-- Права приложения на новую таблицу (была упущена изначально -- поймано тестом test_auth_google.py)
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO app_writer;
