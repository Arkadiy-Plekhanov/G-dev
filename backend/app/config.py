from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://app_writer:change_me_in_production@127.0.0.1:5432/selfdev"
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30                    # access-токен -- короткий
    refresh_token_expire_days: int = 60              # refresh-токен -- долгоживущий (мобильные сессии)
    refresh_race_test_delay_seconds: float = 0.0     # только для теста гонки -- искусственно раздвигает окно между SELECT и UPDATE
    google_client_id: str = "REPLACE-WITH-REAL-GOOGLE-OAUTH-CLIENT-ID.apps.googleusercontent.com"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
