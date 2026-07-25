from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(os.getenv("FORWARDER_DATA_DIR", "forwarder_data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class Settings:
    telegram_api_id: int | None
    telegram_api_hash: str
    telegram_session: str
    discord_bot_token: str
    owner_password: str
    db_path: Path
    max_targets_per_run: int
    default_delay_seconds: float

    @classmethod
    def from_env(cls) -> Settings:
        api_id_raw = os.getenv("TELEGRAM_API_ID", "").strip()
        return cls(
            telegram_api_id=int(api_id_raw) if api_id_raw.isdigit() else None,
            telegram_api_hash=os.getenv("TELEGRAM_API_HASH", "").strip(),
            telegram_session=os.getenv("TELEGRAM_SESSION", "").strip(),
            discord_bot_token=os.getenv("DISCORD_BOT_TOKEN", "").strip(),
            owner_password=os.getenv("OWNER_PASSWORD", "").strip(),
            db_path=DATA_DIR / "forwarder.db",
            max_targets_per_run=int(os.getenv("MAX_TARGETS_PER_RUN", "50")),
            default_delay_seconds=float(os.getenv("DEFAULT_DELAY_SECONDS", "8")),
        )


def get_settings() -> Settings:
    return Settings.from_env()
