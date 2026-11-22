"""Add or reconnect a profile by scanning a QR code with the Telegram app,
the way Telegram Desktop logs in. No login code is involved, so it works
when Telegram says it sent a code that never shows up.

Telegram announces the scan by pushing an update, so this needs a client
that listens -- unlike the broadcast clients, which deliberately don't. It
lives in a background task on the server's event loop only while the QR is
on screen (at most LIFETIME seconds) and is then disconnected.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time

from fastapi.concurrency import run_in_threadpool
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

from forwarder import telegram_login
from forwarder.config import get_settings
from forwarder.storage import Storage

from backend.totp_qr import qr_data_uri

log = logging.getLogger("forwarder.login")

LIFETIME = 600  # seconds a QR attempt may stay open, refreshing its code
QR_STORE: dict[str, dict] = {}
#: share key -> wizard token. The share key goes in a link the user opens on
#: another screen (no login there), so it only ever reveals the QR itself.
SHARED: dict[str, str] = {}


def sweep() -> None:
    now = time.time()
    for token, state in list(QR_STORE.items()):
        if now - state["created"] > LIFETIME + 300:
            stop(token)


def stop(token: str) -> None:
    state = QR_STORE.pop(token, None)
    if state:
        SHARED.pop(state.get("share_key", ""), None)
    if state and state.get("task") and not state["task"].done():
        state["task"].cancel()


def _publish(state: dict, qr) -> None:
    state["qr_url"] = qr.url
    state["qr_image"] = qr_data_uri(qr.url)
    state["qr_expires"] = qr.expires.timestamp()


async def _save_profile(state: dict, session: str, phone: str | None) -> int:
    store = Storage(get_settings().database_url)
    reconnect_id = state.get("reconnect_profile_id")
    if reconnect_id is not None:
        await run_in_threadpool(store.update_profile_session, reconnect_id, session)
        if phone:
            await run_in_threadpool(store.update_profile_phone, reconnect_id, phone)
        return reconnect_id
    return await run_in_threadpool(store.create_profile, state["user_id"], state["label"], session, phone=phone)


async def _run(state: dict, client: TelegramClient, qr) -> None:
    deadline = state["created"] + LIFETIME
    try:
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                state["status"] = "expired"
                return
            try:
                user = await qr.wait(timeout=min(max(qr.expires.timestamp() - time.time(), 1), remaining))
                break
            except asyncio.TimeoutError:
                await qr.recreate()  # each code lives ~30 s; keep a fresh one on screen
                _publish(state, qr)
        session = client.session.save()
        phone = f"+{user.phone}" if getattr(user, "phone", None) else None
        state["profile_id"] = await _save_profile(state, session, phone)
        state["status"] = "done"
        log.info("qr login: done")
    except SessionPasswordNeededError:
        # Hand over to the existing two-step password step.
        state["session"] = client.session.save()
        state["status"] = "password"
        log.info("qr login: two-step password needed")
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log.info("qr login failed: %s", type(exc).__name__)
        state["status"] = "error"
        state["error"] = telegram_login.friendly(exc)
    finally:
        await client.disconnect()


async def start(token: str, user_id: int, label: str, reconnect_profile_id: int | None) -> dict:
    settings = get_settings()
    client = TelegramClient(StringSession(), settings.telegram_api_id, settings.telegram_api_hash)
    await asyncio.wait_for(client.connect(), timeout=30)
    try:
        qr = await client.qr_login()
    except Exception:
        await client.disconnect()
        raise
    state = {
        "user_id": user_id,
        "label": label,
        "reconnect_profile_id": reconnect_profile_id,
        "created": time.time(),
        "status": "waiting",
        "share_key": secrets.token_urlsafe(18),
    }
    _publish(state, qr)
    state["task"] = asyncio.get_running_loop().create_task(_run(state, client, qr))
    QR_STORE[token] = state
    SHARED[state["share_key"]] = token
    log.info("qr login: started")
    return state


def public(state: dict) -> dict:
    return {
        "status": state["status"],
        "qr_image": state.get("qr_image") if state["status"] == "waiting" else None,
        "qr_url": state.get("qr_url") if state["status"] == "waiting" else None,
        "profile_id": state.get("profile_id"),
        "error": state.get("error"),
        "share_key": state.get("share_key") if state["status"] == "waiting" else None,
    }


def shared(share_key: str) -> dict | None:
    """What the share link shows: the live QR and nothing about the account."""
    state = QR_STORE.get(SHARED.get(share_key, ""))
    if not state:
        return None
    waiting = state["status"] == "waiting"
    return {
        "status": state["status"] if state["status"] in ("waiting", "done") else "closed",
        "qr_image": state.get("qr_image") if waiting else None,
        "expires_in": max(0, round(state.get("qr_expires", 0) - time.time())) if waiting else None,
    }
