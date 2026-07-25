from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass

from telethon import TelegramClient
from telethon.errors import (
    ChannelPrivateError,
    ChatWriteForbiddenError,
    FloodWaitError,
    SessionPasswordNeededError,
    SlowModeWaitError,
    UserBannedInChannelError,
)
from telethon.sessions import StringSession
from telethon.tl.types import Channel, Chat, MessageEmpty


@dataclass
class TelegramTarget:
    id: str
    name: str
    kind: str
    slowmode_seconds: int = 0
    stars_required: int = 0


@dataclass
class SendResult:
    target_id: str
    target_name: str
    status: str
    detail: str = ""


_STARS_HINT = re.compile(
    r"paid.?messages|send.?paid|stars|PAYMENT_REQUIRED|PAID_MEDIA",
    re.IGNORECASE,
)
_DELETED_HINT = re.compile(
    r"missing message mapping|MessageEmpty",
    re.IGNORECASE,
)


class TelegramService:
    def __init__(self, api_id: int | None, api_hash: str, session: str = "") -> None:
        self.api_id = api_id
        self.api_hash = api_hash
        self.session = session

    def configured(self) -> bool:
        return bool(self.api_id and self.api_hash)

    def has_session(self) -> bool:
        return bool(self.session)

    def _client(self) -> TelegramClient:
        if not self.api_id or not self.api_hash:
            raise RuntimeError("TELEGRAM_API_ID and TELEGRAM_API_HASH are required")
        return TelegramClient(StringSession(self.session or ""), self.api_id, self.api_hash)

    async def status(self) -> dict[str, str | bool]:
        if not self.configured():
            return {"ok": False, "detail": "Missing TELEGRAM_API_ID / TELEGRAM_API_HASH"}
        if not self.has_session():
            return {"ok": False, "detail": "No TELEGRAM_SESSION yet — complete login"}
        client = self._client()
        try:
            await client.connect()
            if not await client.is_user_authorized():
                return {"ok": False, "detail": "Session is not authorized"}
            me = await client.get_me()
            name = " ".join(filter(None, [me.first_name, me.last_name])) or (
                me.username or str(me.id)
            )
            return {"ok": True, "detail": f"Logged in as {name}"}
        except Exception as exc:
            return {"ok": False, "detail": str(exc)[:300]}
        finally:
            await client.disconnect()

    async def request_code(self, phone: str) -> tuple[str, str]:
        """Returns (phone_code_hash, updated_session_string)."""
        client = self._client()
        try:
            await client.connect()
            sent = await client.send_code_request(phone)
            self.session = client.session.save()
            return sent.phone_code_hash, self.session
        finally:
            await client.disconnect()

    async def complete_login(
        self,
        phone: str,
        code: str,
        phone_code_hash: str,
        password: str | None = None,
    ) -> str:
        client = self._client()
        try:
            await client.connect()
            try:
                await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash)
            except SessionPasswordNeededError:
                if not password:
                    raise RuntimeError("2FA password required")
                await client.sign_in(password=password)
            self.session = client.session.save()
            return self.session
        finally:
            await client.disconnect()

    async def list_groups(self, skip_ids: set[str] | None = None) -> list[TelegramTarget]:
        """List every group/supergroup on the account (not DMs / broadcast channels)."""
        skip_ids = skip_ids or set()
        client = self._client()
        targets: list[TelegramTarget] = []
        try:
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")
            async for dialog in client.iter_dialogs():
                entity = dialog.entity
                tid = str(dialog.id)
                if tid in skip_ids:
                    continue
                if isinstance(entity, Chat):
                    targets.append(
                        TelegramTarget(
                            id=tid,
                            name=dialog.name or tid,
                            kind="group",
                        )
                    )
                elif isinstance(entity, Channel) and not entity.broadcast:
                    stars = int(getattr(entity, "send_paid_messages_stars", None) or 0)
                    targets.append(
                        TelegramTarget(
                            id=tid,
                            name=dialog.name or tid,
                            kind="supergroup",
                            stars_required=stars,
                        )
                    )
            targets.sort(key=lambda t: t.name.lower())
            return targets
        finally:
            await client.disconnect()

    @staticmethod
    def _is_deleted_response(msg, exc: Exception | None = None) -> bool:
        if isinstance(msg, MessageEmpty):
            return True
        if exc is not None and _DELETED_HINT.search(str(exc)):
            return True
        # Telethon sometimes returns a Message with no text/media after anti-spam wipe
        if msg is not None and not isinstance(msg, MessageEmpty):
            text = getattr(msg, "message", None)
            media = getattr(msg, "media", None)
            msg_id = getattr(msg, "id", None)
            if msg_id and text in (None, "") and media is None:
                # Could be a service message; treat empty body as suspicious only with hint
                return False
        return False

    @staticmethod
    def _stars_required(entity) -> int:
        return int(getattr(entity, "send_paid_messages_stars", None) or 0)

    async def _send_one(
        self,
        client: TelegramClient,
        target_id: str,
        name: str,
        message: str,
        max_slowmode_wait: int,
        verify_seconds: float = 1.5,
    ) -> SendResult:
        peer = int(target_id)
        try:
            entity = await asyncio.wait_for(client.get_entity(peer), timeout=30)
        except Exception as exc:
            return SendResult(target_id, name, "skipped", f"cannot resolve peer: {exc}"[:280])

        stars = self._stars_required(entity)
        if stars > 0:
            return SendResult(
                target_id,
                name,
                "skipped_stars",
                f"requires {stars} Telegram Stars to send — auto-skipped",
            )

        async def do_send():
            return await asyncio.wait_for(client.send_message(entity, message), timeout=60)

        async def verify_kept(msg) -> bool:
            """Return False if the group wiped the message shortly after send."""
            if self._is_deleted_response(msg):
                return False
            msg_id = getattr(msg, "id", None)
            if not msg_id:
                return True
            await asyncio.sleep(verify_seconds)
            try:
                fetched = await asyncio.wait_for(
                    client.get_messages(entity, ids=msg_id), timeout=30
                )
                if fetched is None or isinstance(fetched, MessageEmpty):
                    return False
                if isinstance(fetched, list):
                    if not fetched or all(
                        x is None or isinstance(x, MessageEmpty) for x in fetched
                    ):
                        return False
            except Exception:
                return True
            return True

        try:
            msg = await do_send()
            if not await verify_kept(msg):
                return SendResult(
                    target_id,
                    name,
                    "auto_deleted",
                    "message wiped by group shortly after send — blacklisted",
                )
            return SendResult(target_id, name, "ok", "sent")
        except SlowModeWaitError as exc:
            wait = int(exc.seconds) + 1
            if wait > max_slowmode_wait:
                return SendResult(
                    target_id,
                    name,
                    "skipped_slowmode",
                    f"slowmode {wait}s exceeds max wait {max_slowmode_wait}s — try next run",
                )
            await asyncio.sleep(wait)
            try:
                msg = await do_send()
                if not await verify_kept(msg):
                    return SendResult(
                        target_id,
                        name,
                        "auto_deleted",
                        "wiped after slowmode wait — group blacklisted",
                    )
                return SendResult(
                    target_id, name, "ok", f"sent after slowmode wait {wait}s"
                )
            except Exception as retry_exc:
                return self._classify_send_error(target_id, name, retry_exc)
        except FloodWaitError as exc:
            wait = int(exc.seconds) + 1
            if wait > max_slowmode_wait:
                return SendResult(
                    target_id,
                    name,
                    "error",
                    f"FloodWait {wait}s too long — stopped for this group",
                )
            await asyncio.sleep(wait)
            try:
                msg = await do_send()
                if not await verify_kept(msg):
                    return SendResult(
                        target_id,
                        name,
                        "auto_deleted",
                        "wiped after FloodWait — group blacklisted",
                    )
                return SendResult(target_id, name, "ok", f"sent after FloodWait {wait}s")
            except Exception as retry_exc:
                return self._classify_send_error(target_id, name, retry_exc)
        except Exception as exc:
            return self._classify_send_error(target_id, name, exc)

    def _classify_send_error(self, target_id: str, name: str, exc: Exception) -> SendResult:
        text = str(exc)
        if self._is_deleted_response(None, exc):
            return SendResult(
                target_id,
                name,
                "auto_deleted",
                "message wiped by group (missing mapping) — blacklisted",
            )
        if _STARS_HINT.search(text) or "PAYMENT" in text.upper():
            return SendResult(
                target_id,
                name,
                "skipped_stars",
                f"stars/paid messages required — auto-skipped ({text[:180]})",
            )
        if isinstance(exc, ChatWriteForbiddenError):
            return SendResult(target_id, name, "skipped_forbidden", "no permission to send")
        if isinstance(exc, UserBannedInChannelError):
            return SendResult(target_id, name, "skipped_banned", "account banned in this group")
        if isinstance(exc, ChannelPrivateError):
            return SendResult(target_id, name, "skipped_private", "channel/group is private or left")
        return SendResult(target_id, name, "error", text[:300])

    async def broadcast_all_groups(
        self,
        message: str,
        delay_seconds: float,
        skip_ids: set[str] | None = None,
        max_slowmode_wait: int = 1800,
        progress_cb=None,
    ) -> list[SendResult]:
        """
        Send once to every group on the account (minus skip_ids), then stop.

        Automatically:
        - skips Telegram Stars / paid-message groups
        - waits for slowmode / FloodWait (up to max_slowmode_wait seconds)
        - detects auto-deleted posts and marks them auto_deleted for blacklisting
        """
        if not message.strip():
            raise ValueError("Message is empty")

        skip_ids = set(skip_ids or set())
        client = self._client()
        results: list[SendResult] = []
        try:
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")

            targets = await self._collect_targets(client, skip_ids)
            total = len(targets)
            for index, target in enumerate(targets):
                if progress_cb:
                    progress_cb(index, total, target.name)

                # Stars known from listing
                if target.stars_required > 0:
                    result = SendResult(
                        target.id,
                        target.name,
                        "skipped_stars",
                        f"requires {target.stars_required} Stars — auto-skipped",
                    )
                else:
                    result = await self._send_one(
                        client,
                        target.id,
                        target.name,
                        message,
                        max_slowmode_wait=max_slowmode_wait,
                    )
                results.append(result)

                if index < total - 1 and delay_seconds > 0:
                    await asyncio.sleep(delay_seconds)

            if progress_cb:
                progress_cb(total, total, "done")
            return results
        finally:
            await client.disconnect()

    async def _collect_targets(
        self, client: TelegramClient, skip_ids: set[str]
    ) -> list[TelegramTarget]:
        targets: list[TelegramTarget] = []
        async for dialog in client.iter_dialogs():
            entity = dialog.entity
            tid = str(dialog.id)
            if tid in skip_ids:
                continue
            if isinstance(entity, Chat):
                targets.append(
                    TelegramTarget(id=tid, name=dialog.name or tid, kind="group")
                )
            elif isinstance(entity, Channel) and not entity.broadcast:
                stars = int(getattr(entity, "send_paid_messages_stars", None) or 0)
                targets.append(
                    TelegramTarget(
                        id=tid,
                        name=dialog.name or tid,
                        kind="supergroup",
                        stars_required=stars,
                    )
                )
        targets.sort(key=lambda t: t.name.lower())
        return targets

    async def send_to_group(
        self,
        message: str,
        target_id: str,
        name: str,
        max_slowmode_wait: int = 300,
        verify_seconds: float = 1.5,
    ) -> SendResult:
        """Connect, send to one group, disconnect. Used for live Streamlit progress."""
        if not message.strip():
            raise ValueError("Message is empty")
        client = self._client()
        try:
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")
            return await self._send_one(
                client,
                target_id,
                name,
                message,
                max_slowmode_wait=max_slowmode_wait,
                verify_seconds=verify_seconds,
            )
        finally:
            await client.disconnect()

        self,
        message: str,
        target_ids: list[str],
        delay_seconds: float,
        max_targets: int,
        name_lookup: dict[str, str] | None = None,
        skip_ids: set[str] | None = None,
        max_slowmode_wait: int = 1800,
    ) -> list[SendResult]:
        if not message.strip():
            raise ValueError("Message is empty")
        skip_ids = set(skip_ids or set())
        name_lookup = name_lookup or {}
        selected = [tid for tid in target_ids[:max_targets] if tid not in skip_ids]
        results: list[SendResult] = []
        client = self._client()
        try:
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")
            for index, target_id in enumerate(selected):
                name = name_lookup.get(target_id, target_id)
                results.append(
                    await self._send_one(
                        client, target_id, name, message, max_slowmode_wait
                    )
                )
                if index < len(selected) - 1 and delay_seconds > 0:
                    await asyncio.sleep(delay_seconds)
            return results
        finally:
            await client.disconnect()
