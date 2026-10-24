from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone

from forwarder.config import get_settings
from forwarder.storage import Storage, UserRow
from forwarder.telegram_service import TelegramService

log = logging.getLogger("forwarder.notify")


def notify_login(user: UserRow, ip: str | None) -> None:
    """Fire-and-forget: DMs the account's own Saved Messages (via its first
    connected Telegram profile) that a login just happened. Runs in a
    background thread with its own DB connection and event loop -- never
    blocks or can fail the login response it's called from. Silently does
    nothing if the account has no connected profile yet (e.g. the very
    first login, before Connect has been used)."""
    threading.Thread(
        target=_notify_login_thread, args=(user.id, ip), name="login-notify", daemon=True
    ).start()


def _notify_login_thread(user_id: int, ip: str | None) -> None:
    try:
        settings = get_settings()
        store = Storage(settings.database_url)
        profiles = store.list_profiles_for_user(user_id)
        profile = next((p for p in profiles if p.telegram_session), None)
        if not profile:
            return
        api_id = profile.telegram_api_id or settings.telegram_api_id
        api_hash = profile.telegram_api_hash or settings.telegram_api_hash
        tg = TelegramService(api_id, api_hash, profile.telegram_session)
        when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        text = (
            "\U0001f510 New login to Group Forwarder\n"
            f"Time: {when}\n"
            f"IP: {ip or 'unknown'}\n\n"
            "Wasn't you? Change your password and ask an admin to reset your 2FA."
        )
        asyncio.run(tg.send_to_self(text))
    except Exception:
        log.exception("Login notification failed for user %s", user_id)
