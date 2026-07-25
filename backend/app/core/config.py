from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Telegram Campaign Manager"
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    bot_token: str
    jwt_secret: str
    jwt_expires_minutes: int = 60 * 24 * 7
    fernet_key: str
    admin_telegram_ids: str = ""
    web_origin: str = "http://localhost:5173"
    log_level: str = "INFO"
    default_account_daily_limit: int = 250
    default_account_hourly_limit: int = 40
    default_min_delay_seconds: int = 45
    default_max_delay_seconds: int = 180

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def admin_ids(self) -> set[int]:
        return {int(x.strip()) for x in self.admin_telegram_ids.split(",") if x.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
