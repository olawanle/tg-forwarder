from __future__ import annotations

from forwarder.config import get_settings
from forwarder.storage import ProfileRow
from forwarder.telegram_service import TelegramService


def build_telegram_service(profile: ProfileRow) -> TelegramService:
    settings = get_settings()
    api_id = profile.telegram_api_id or settings.telegram_api_id
    api_hash = profile.telegram_api_hash or settings.telegram_api_hash
    return TelegramService(api_id, api_hash, profile.telegram_session)
