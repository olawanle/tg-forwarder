from __future__ import annotations

from fastapi import HTTPException, status

from forwarder.config import get_settings
from forwarder.job_runner import get_job_runner
from forwarder.storage import ProfileRow
from forwarder.telegram_service import TelegramService


def build_telegram_service(profile: ProfileRow) -> TelegramService:
    settings = get_settings()
    api_id = profile.telegram_api_id or settings.telegram_api_id
    api_hash = profile.telegram_api_hash or settings.telegram_api_hash
    return TelegramService(api_id, api_hash, profile.telegram_session)


def ensure_profile_not_broadcasting(profile: ProfileRow) -> None:
    """Telegram allows only one live MTProto connection per session at a
    time -- a second one (this profile's own broadcast worker already
    holds one) gets 'wrong session ID' errors on both sides, and Telethon's
    automatic reconnect burns real time recovering. Block ad-hoc reads
    (preview groups, refresh saved messages, leave groups) while a
    broadcast is actually running for this profile instead of silently
    colliding with it."""
    if get_job_runner().is_worker_alive(profile.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A broadcast is currently running for this profile — this needs its own "
            "Telegram connection, so it has to wait until the broadcast finishes "
            "(check Progress) or is cancelled.",
        )
