from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    telegram_api_id: int | None
    telegram_api_hash: str
    telegram_session: str
    discord_bot_token: str
    database_url: str
    session_encryption_key: str
    admin_email: str
    admin_initial_password: str
    max_targets_per_run: int
    default_delay_seconds: float

    @classmethod
    def from_env(cls) -> Settings:
        api_id_raw = os.getenv("TELEGRAM_API_ID", "").strip()
        return cls(
            telegram_api_id=int(api_id_raw) if api_id_raw.isdigit() else None,
            telegram_api_hash=os.getenv("TELEGRAM_API_HASH", "").strip(),
            # Fallback only: used to seed the admin's first profile during
            # migration. The app itself now reads sessions from the database.
            telegram_session=os.getenv("TELEGRAM_SESSION", "").strip(),
            discord_bot_token=os.getenv("DISCORD_BOT_TOKEN", "").strip(),
            database_url=os.getenv("DATABASE_URL", "").strip(),
            session_encryption_key=os.getenv("SESSION_ENCRYPTION_KEY", "").strip(),
            admin_email=os.getenv("ADMIN_EMAIL", "").strip().lower(),
            admin_initial_password=os.getenv("ADMIN_INITIAL_PASSWORD", "").strip(),
            max_targets_per_run=int(os.getenv("MAX_TARGETS_PER_RUN", "50")),
            default_delay_seconds=float(os.getenv("DEFAULT_DELAY_SECONDS", "8")),
        )


def get_settings() -> Settings:
    return Settings.from_env()
